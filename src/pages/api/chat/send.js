import { getOrCreateChatSession, insertChatMessage, getChatMessages } from "../../../lib/supabase.server.js";
import { processBuyerMessage } from "../../../lib/chat-ai-guard.server.js";
import { sendToTelegramAdmin } from "../../../lib/telegram.server.js";
import { sanitizeText } from "../../../lib/sanitize.js";

export const prerender = false;

// ==============================================================================
// RATE LIMITER & BENTENG ANTI-BONCOS TOKEN (COOLDOWN 3S, 5/MIN, 25 AI/HARI)
// ==============================================================================
const rateLimitStore = new Map();
const COOLDOWN_MS = 3 * 1000; // 3 detik cooldown per pesan
const WINDOW_60S_MS = 60 * 1000; // 1 menit window
const MAX_PER_MINUTE = 5; // Maksimal 5 pesan per menit
const DAILY_AI_LIMIT = 25; // Maksimal 25 balasan AI per hari per visitor/IP
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function checkRateAndQuotaLimits(key, messageText) {
    const now = Date.now();
    let entry = rateLimitStore.get(key);

    if (!entry) {
        entry = {
            lastMsgTime: 0,
            timestamps: [],
            dailyAiCount: 0,
            dailyResetTime: now + ONE_DAY_MS,
            lastMessageText: ""
        };
        rateLimitStore.set(key, entry);
    }

    // 1. Cooldown 3 Detik
    if (entry.lastMsgTime && (now - entry.lastMsgTime < COOLDOWN_MS)) {
        const waitSec = Math.ceil((COOLDOWN_MS - (now - entry.lastMsgTime)) / 1000);
        return {
            allowed: false,
            status: 429,
            error: `Mohon tunggu ${waitSec} detik sebelum mengirim pesan berikutnya.`
        };
    }

    // 2. Rate Limit 5 Pesan per Menit
    entry.timestamps = entry.timestamps.filter(ts => now - ts < WINDOW_60S_MS);
    if (entry.timestamps.length >= MAX_PER_MINUTE) {
        const retryAfterSec = Math.ceil((WINDOW_60S_MS - (now - entry.timestamps[0])) / 1000);
        return {
            allowed: false,
            status: 429,
            error: `Batas 5 pesan per menit tercapai. Mohon tunggu ${retryAfterSec} detik.`
        };
    }

    // 3. Reset Daily AI Quota jika sudah lewat 24 jam
    if (now > entry.dailyResetTime) {
        entry.dailyAiCount = 0;
        entry.dailyResetTime = now + ONE_DAY_MS;
    }

    // 4. Duplicate Input Blocker (0 Token Check)
    const normalizedInput = messageText.trim().toLowerCase();
    const isDuplicate = Boolean(entry.lastMessageText && entry.lastMessageText.trim().toLowerCase() === normalizedInput);

    // 5. Daily AI Quota Check (Maks. 25 Balasan AI per Hari)
    const isDailyQuotaExceeded = entry.dailyAiCount >= DAILY_AI_LIMIT;

    return {
        allowed: true,
        entry,
        isDuplicate,
        isDailyQuotaExceeded
    };
}

// Garbage collection berkala setiap 5 menit agar memori tetap bersih
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now - entry.lastMsgTime > ONE_DAY_MS && now > entry.dailyResetTime) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

function sanitizeVisitorToken(token) {
    if (!token || typeof token !== "string") return "";
    return token.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 64);
}

export const POST = async ({ request, clientAddress }) => {
    try {
        const body = await request.json().catch(() => ({}));
        const rawToken = body?.visitor_token;
        const baseToken = sanitizeVisitorToken(rawToken);

        if (!baseToken) {
            return new Response(JSON.stringify({
                success: false,
                error: "Field visitor_token wajib disertakan."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 1. HARD CHARACTER LIMIT DI SERVER (Maksimal 400 Karakter)
        const rawMessage = body?.message;
        if (!rawMessage || typeof rawMessage !== "string" || !rawMessage.trim()) {
            return new Response(JSON.stringify({
                success: false,
                error: "Pesan chat tidak boleh kosong."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (rawMessage.trim().length > 400) {
            return new Response(JSON.stringify({
                success: false,
                error: "Pesan chat melebihi batas maksimal 400 karakter."
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const messageText = sanitizeText(rawMessage.trim(), 400);
        const clientMsgId = body?.client_msg_id ? sanitizeText(body.client_msg_id, 64) : null;

        // 2. VERIFIKASI LIMIT BERLAPIS (Cooldown 3s, 5/menit, Kuota 25 AI/hari, Anti-Duplicate)
        const ip = clientAddress || "0.0.0.0";
        const rateLimitKey = `${ip}:${baseToken}`;
        const limitCheck = checkRateAndQuotaLimits(rateLimitKey, messageText);

        if (!limitCheck.allowed) {
            return new Response(JSON.stringify({
                success: false,
                error: limitCheck.error
            }), {
                status: limitCheck.status,
                headers: { "Content-Type": "application/json" }
            });
        }

        const { entry, isDuplicate, isDailyQuotaExceeded } = limitCheck;

        // 3. ARSITEKTUR THREADING KONTEKSTUAL (General vs Order Dispute)
        const rawOrderId = body?.order_id || body?.context_order_id;
        const cleanOrderId = rawOrderId ? sanitizeText(String(rawOrderId), 50).replace(/[^a-zA-Z0-9_\-]/g, "") : null;
        const threadType = cleanOrderId ? "order" : (body?.thread_type === "order" ? "order" : "general");

        // Jika ada order_id, pisahkan visitor_token ke sesi independen order
        const effectiveToken = cleanOrderId ? `${baseToken}__order_${cleanOrderId}` : baseToken;

        const lang = body?.lang === "en" ? "en" : "id";
        const contextProduct = body?.context_product ? sanitizeText(body.context_product, 100) : null;
        const customerEmail = body?.customer_email || body?.email ? sanitizeText(body.customer_email || body.email, 120) : null;

        const metadata = {
            buyerName: sanitizeText(body?.name || "", 60),
            buyerEmail: customerEmail,
            buyerPhone: sanitizeText(body?.phone || "", 30),
            contextProduct,
            contextOrderId: cleanOrderId,
            threadType,
            lang
        };

        const sessionResult = await getOrCreateChatSession(effectiveToken, metadata);
        if (!sessionResult?.success || !sessionResult?.session) {
            return new Response(JSON.stringify({
                success: false,
                error: "Gagal menghubungkan ke sesi percakapan."
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const session = sessionResult.session;

        // Deteksi Perpindahan Produk pada Thread General: Beri penanda konteks produk jika berganti
        if (threadType === "general" && contextProduct && session.context_product && session.context_product !== contextProduct) {
            await insertChatMessage({
                sessionId: session.id,
                senderRole: "system",
                message: `[Konteks Produk: ${contextProduct}]`
            });
            session.context_product = contextProduct;
        }

        // Tautkan Email Pelanggan jika user login / input email
        if (customerEmail && session.buyer_email !== customerEmail) {
            session.buyer_email = customerEmail;
        }

        // Catat pengiriman pesan sukses ke rate limit store
        const now = Date.now();
        entry.lastMsgTime = now;
        entry.timestamps.push(now);
        entry.lastMessageText = messageText;

        // 4. SIMPAN PESAN PEMBELI KE DATABASE (Deduplikasi ID Presisi)
        const buyerMsgResult = await insertChatMessage({
            id: clientMsgId || undefined,
            sessionId: session.id,
            senderRole: "buyer",
            message: messageText
        });
        const buyerMsgId = buyerMsgResult?.message?.id || clientMsgId || `bmsg_${now}`;

        // 5. PERCABANGAN MODE: ADMIN TAKEOVER (HUMAN)
        if (session.mode === "human") {
            await sendToTelegramAdmin({
                session,
                buyerMessage: messageText,
                aiReply: null,
                isEscalated: true
            });

            return new Response(JSON.stringify({
                success: true,
                mode: "human",
                reply: null,
                buyer_msg_id: buyerMsgId,
                client_msg_id: clientMsgId,
                message: lang === "en"
                    ? "Your message has been forwarded directly to the admin. Please wait a moment for a response."
                    : "Pesan Anda telah diteruskan langsung ke Admin Yasui Game. Mohon tunggu balasan beberapa saat."
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 6. PROTEKSI 0-TOKEN: DUPLICATE INPUT BLOCKER
        if (isDuplicate) {
            const duplicateReply = lang === "en"
                ? "This message is identical to your previous question. Please wait a moment for processing or contact our CS via WhatsApp."
                : "Pertanyaan ini sama persis dengan pesan Anda sebelumnya. Mohon tunggu beberapa saat atau hubungi Admin via WhatsApp jika membutuhkan bantuan darurat.";

            const dupMsgResult = await insertChatMessage({
                sessionId: session.id,
                senderRole: "ai",
                message: duplicateReply,
                riskScore: 0
            });

            return new Response(JSON.stringify({
                success: true,
                mode: "ai",
                reply: duplicateReply,
                buyer_msg_id: buyerMsgId,
                ai_msg_id: dupMsgResult?.message?.id,
                client_msg_id: clientMsgId,
                is_duplicate: true,
                risk_score: 0,
                is_escalated: false
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 7. PROTEKSI 0-TOKEN: DAILY AI QUOTA EXCEEDED (MAKSIMAL 25 BALASAN AI / HARI)
        if (isDailyQuotaExceeded) {
            const quotaReply = lang === "en"
                ? "Your daily instant assistant quota has reached its limit (25 messages/day). For further inquiries or assistance, please reach out to our Admin via WhatsApp or check our FAQ / How to Order guides."
                : "Batas kuota harian asisten instan Anda telah tercapai (maksimal 25 balasan per hari). Untuk bantuan transaksi lebih lanjut, silakan hubungi Admin kami via WhatsApp resmi atau periksa menu Cara Order.";

            const quotaMsgResult = await insertChatMessage({
                sessionId: session.id,
                senderRole: "ai",
                message: quotaReply,
                riskScore: 0
            });

            return new Response(JSON.stringify({
                success: true,
                mode: "ai",
                reply: quotaReply,
                buyer_msg_id: buyerMsgId,
                ai_msg_id: quotaMsgResult?.message?.id,
                client_msg_id: clientMsgId,
                quota_exceeded: true,
                risk_score: 0,
                is_escalated: false
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 8. SLIDING CONTEXT WINDOW (Maksimal 6 Pesan Terakhir)
        const recentMessages = await getChatMessages(session.id, 6);

        // 9. PROSES PESAN MELALUI AI GUARDRAIL (gpt-6-luna / OpenAI / Fallback)
        const guardResult = await processBuyerMessage({
            message: messageText,
            lang: session.lang || lang,
            session,
            recentMessages
        });

        // Tambahkan hitungan kuota harian AI
        entry.dailyAiCount = (entry.dailyAiCount || 0) + 1;

        // Simpan Balasan AI ke Database
        const aiMsgResult = await insertChatMessage({
            sessionId: session.id,
            senderRole: "ai",
            message: guardResult.reply,
            riskScore: guardResult.riskScore
        });
        const aiMsgId = aiMsgResult?.message?.id;

        // 10. TERUSKAN KE TELEGRAM ADMIN DENGAN FILTER ANTI-BANJIR
        sendToTelegramAdmin({
            session,
            buyerMessage: messageText,
            aiReply: guardResult.reply,
            isEscalated: guardResult.isEscalated
        }).catch(err => {
            console.warn("[Chat Send] Telegram admin forward error:", err.message);
        });

        return new Response(JSON.stringify({
            success: true,
            mode: "ai",
            reply: guardResult.reply,
            buyer_msg_id: buyerMsgId,
            ai_msg_id: aiMsgId,
            client_msg_id: clientMsgId,
            risk_score: guardResult.riskScore,
            is_escalated: guardResult.isEscalated
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("[Chat Send API Error]:", err.message);
        return new Response(JSON.stringify({
            success: false,
            error: "Terjadi kesalahan internal pada layanan chat."
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
