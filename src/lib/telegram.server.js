import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.server.js";

// Guard: Modul ini hanya boleh dijalankan di server-side context (Node.js / SSR Astro)
if (import.meta.env && import.meta.env.SSR === false) {
    throw new Error("Security Violation: Telegram server module can only be imported in server-side context.");
}

const getEnv = (key, fallback = "") => {
    try {
        const envPath = path.resolve(process.cwd(), ".env");
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, "utf-8");
            const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
            if (match && match[1]) {
                const val = match[1].trim().replace(/^["']|["']$/g, "");
                if (typeof process !== "undefined" && process.env) {
                    process.env[key] = val;
                }
                return val;
            }
        }
    } catch (e) {}
    if (typeof process !== "undefined" && process.env && process.env[key]) {
        return process.env[key];
    }
    try {
        if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
            return import.meta.env[key];
        }
    } catch (e) {}
    return fallback;
};

const getTelegramBotToken = () => getEnv("TELEGRAM_BOT_TOKEN");
const getTelegramAdminChatId = () => getEnv("TELEGRAM_ADMIN_CHAT_ID");
const getTelegramForumThreadId = () => getEnv("TELEGRAM_FORUM_THREAD_ID");

export function isTelegramConfigured() {
    return Boolean(getTelegramBotToken() && getTelegramAdminChatId());
}

/**
 * Escape HTML special chars untuk format pesan Telegram HTML mode
 */
function escapeTgHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Universal fetcher ke Telegram Bot API dengan timeout 8 detik
 */
async function callTelegramApi(endpoint, payload = {}) {
    const token = getTelegramBotToken();
    if (!token) {
        return { ok: false, description: "TELEGRAM_BOT_TOKEN not configured" };
    }

    const url = `https://api.telegram.org/bot${token}/${endpoint}`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(8000)
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
            console.error(`[Telegram API Error] ${endpoint}:`, data.description || res.statusText);
        }
        return data;
    } catch (err) {
        console.error(`[Telegram API Fetch Error] ${endpoint}:`, err.message);
        return { ok: false, error: err.message };
    }
}

/**
 * Buat Forum Topic baru di Supergroup Telegram
 * @param {string|number} chatId - ID Supergroup Telegram
 * @param {string} name - Nama Topik (1-128 karakter)
 * @param {object} options - Opsi tambahan
 */
export async function createTelegramForumTopic(chatId, name, options = {}) {
    return callTelegramApi("createForumTopic", {
        chat_id: chatId,
        name: String(name).slice(0, 128),
        ...options
    });
}

/**
 * Tutup Forum Topic di Supergroup Telegram
 * @param {string|number} chatId - ID Supergroup Telegram
 * @param {string|number} messageThreadId - ID Thread Topik
 */
export async function closeTelegramForumTopic(chatId, messageThreadId) {
    if (!messageThreadId) return { ok: false, description: "No thread ID provided" };
    return callTelegramApi("closeForumTopic", {
        chat_id: chatId,
        message_thread_id: parseInt(messageThreadId, 10)
    });
}

/**
 * Kirim pesan umum ke Telegram (mendukung Forum Topics via message_thread_id)
 */
export async function sendTelegramMessage(chatId, text, options = {}) {
    const payload = {
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || "HTML",
        reply_markup: options.reply_markup,
        disable_web_page_preview: true
    };

    const threadId = options.message_thread_id !== undefined
        ? options.message_thread_id
        : getTelegramForumThreadId();

    if (threadId) {
        const parsed = parseInt(threadId, 10);
        if (!isNaN(parsed)) {
            payload.message_thread_id = parsed;
        }
    }

    return callTelegramApi("sendMessage", payload);
}

/**
 * Kirim balasan callback query (notifikasi pop-up di Telegram)
 */
export async function answerCallbackQuery(callbackQueryId, text = "", showAlert = false) {
    return callTelegramApi("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert
    });
}

/**
 * Edit inline keyboard reply markup
 */
export async function editTelegramMessageReplyMarkup(chatId, messageId, replyMarkup) {
    return callTelegramApi("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup
    });
}

/**
 * Mengirim notifikasi chat pembeli & balasan AI ke Telegram Admin
 * Mendukung Forum Topics otomatis (1 Topik per Pembeli / Order)
 * Dilengkapi Anti-Banjir Filter untuk skala 100+ user bersamaan:
 * Hanya mengirim notifikasi jika:
 * 1. isEscalated === true (pembeli minta bantuan admin)
 * 2. mode === 'human' (admin manual aktif)
 * 3. Terdapat order_id aktif (sengketa/pertanyaan pesanan)
 * 4. TELEGRAM_NOTIFY_ALL === 'true' di .env
 *
 * @param {object} param0
 * @param {object} param0.session - Session chat object
 * @param {string} param0.buyerMessage - Pesan dari pembeli
 * @param {string|null} param0.aiReply - Balasan AI (jika ada)
 * @param {boolean} param0.isEscalated - Apakah eskalasi bantuan manusia diperlukan
 */
export async function sendToTelegramAdmin({
    session,
    buyerMessage,
    aiReply = null,
    isEscalated = false
}) {
    if (!isTelegramConfigured()) {
        console.info("[Telegram Server] Telegram admin notification skipped (credentials not configured)");
        return { ok: false, reason: "not_configured" };
    }

    const mode = session?.mode || "ai";
    const contextOrderId = session?.order_id || session?.context_order_id || null;
    const notifyAll = getEnv("TELEGRAM_NOTIFY_ALL") === "true";

    // FILTER ANTI-BANJIR: Jangan spam grup Telegram untuk tanya-jawab umum yang sudah ditangani AI
    const shouldNotify = isEscalated || mode === "human" || Boolean(contextOrderId) || notifyAll;
    if (!shouldNotify) {
        return { ok: true, skipped: true, reason: "anti_flood_ai_handled" };
    }

    const adminChatId = getTelegramAdminChatId();
    if (!adminChatId) {
        return { ok: false, reason: "admin_chat_id_not_configured" };
    }

    // =========================================================================
    // 1. AUTO-FORUM TOPIC RESOLUTION (1 Topik per Pembeli / Order)
    // =========================================================================
    let topicId = session?.telegram_topic_id || null;

    // Cek apakah session.telegram_topic_id sudah ada di database chat_sessions
    if (!topicId && session?.id && isSupabaseConfigured() && supabaseAdmin) {
        try {
            const { data: dbSess } = await supabaseAdmin
                .from("chat_sessions")
                .select("telegram_topic_id")
                .eq("id", session.id)
                .maybeSingle();

            if (dbSess?.telegram_topic_id) {
                topicId = dbSess.telegram_topic_id;
                session.telegram_topic_id = topicId;
            }
        } catch (dbReadErr) {
            console.warn("[Telegram Server] Could not check telegram_topic_id in DB:", dbReadErr.message);
        }
    }

    // Jika BELUM ada (!session.telegram_topic_id): Buat Forum Topic Baru via API Telegram
    if (!topicId) {
        const customerName = session?.customer_name || session?.buyer_name || null;
        const productContext = session?.product_context || session?.context_product || "General";

        // Format nama topik:
        // Order: "📦 #${session.order_id} | ${session.customer_name || 'Buyer'}"
        // General: "💬 ${session.customer_name || 'Guest'} | ${(session.product_context || 'General').slice(0, 35)}"
        let topicName;
        if (contextOrderId) {
            topicName = `📦 #${contextOrderId} | ${customerName || "Buyer"}`;
        } else {
            topicName = `💬 ${customerName || "Guest"} | ${String(productContext).slice(0, 35)}`;
        }

        try {
            const topicRes = await createTelegramForumTopic(adminChatId, topicName);
            if (topicRes?.ok && topicRes?.result?.message_thread_id) {
                topicId = topicRes.result.message_thread_id;
                session.telegram_topic_id = topicId;

                // Simpan ke kolom telegram_topic_id pada tabel chat_sessions di Supabase
                if (session?.id && isSupabaseConfigured() && supabaseAdmin) {
                    try {
                        await supabaseAdmin
                            .from("chat_sessions")
                            .update({
                                telegram_topic_id: topicId,
                                last_message_at: new Date().toISOString()
                            })
                            .eq("id", session.id);
                    } catch (dbUpdateErr) {
                        console.warn("[Telegram Server] Failed to update telegram_topic_id in Supabase:", dbUpdateErr.message);
                    }
                }
            } else {
                console.warn("[Telegram Server] createForumTopic failed or not supported in this chat, falling back without thread:", topicRes?.description || topicRes?.error);
                topicId = null;
            }
        } catch (topicErr) {
            console.warn("[Telegram Server] Exception creating forum topic, falling back without thread:", topicErr.message);
            topicId = null;
        }
    }

    const sessionId = session?.id || "unknown";
    const buyerName = session?.customer_name || session?.buyer_name || "Guest";
    const buyerEmail = session?.customer_email || session?.buyer_email || "-";
    const buyerPhone = session?.customer_phone || session?.buyer_phone || "-";
    const lang = (session?.lang || "id").toUpperCase();
    const contextProduct = session?.product_context || session?.context_product || null;

    let contextDetails = "";
    if (contextProduct) {
        contextDetails += `\n📦 <b>Produk:</b> ${escapeTgHtml(contextProduct)}`;
    }
    if (contextOrderId) {
        contextDetails += `\n🧾 <b>Order ID:</b> <code>#${escapeTgHtml(contextOrderId)}</code>`;
    }

    const statusBadge = isEscalated
        ? "🚨 <b>[ESKALASI BANTUAN DIPERLUKAN]</b>"
        : mode === "human"
            ? "👨‍💻 <b>[MODE ADMIN MANUAL]</b>"
            : contextOrderId
                ? "🧾 <b>[DISKUSI PESANAN / SENGKETA]</b>"
                : "🤖 <b>[MODE AI ACTIVE]</b>";

    const orderTag = contextOrderId ? ` • <b>#ORDER_${escapeTgHtml(contextOrderId)}</b>` : "";

    let messageBody = `
${statusBadge}
⚡ <b>[YASUI CHAT]</b> • <b>#SID_${sessionId}</b>${orderTag}
👤 <b>Pembeli:</b> ${escapeTgHtml(buyerName)} (${lang})
📧 <b>Email:</b> <code>${escapeTgHtml(buyerEmail)}</code> | 📱 <code>${escapeTgHtml(buyerPhone)}</code>${contextDetails}

💬 <b>Pesan Pembeli:</b>
<i>"${escapeTgHtml(buyerMessage)}"</i>
`.trim();

    if (aiReply) {
        messageBody += `\n\n🤖 <b>Balasan AI:</b>\n<i>"${escapeTgHtml(aiReply)}"</i>`;
    }

    messageBody += `\n\n━━━━━━━━━━━━━━━━━━━━━\nℹ️ <i>Ketik pesan di topik ini untuk membalas pembeli secara real-time. Ketik /ai untuk mengaktifkan kembali bot, atau /close untuk menutup sesi.</i>`;

    const inlineKeyboard = {
        inline_keyboard: [
            [
                { text: "👨‍💻 Ambil Alih Manual", callback_data: `takeover:${sessionId}` },
                { text: "🤖 Mode AI", callback_data: `aimode:${sessionId}` }
            ],
            [
                { text: "🔒 Tutup Sesi", callback_data: `close:${sessionId}` }
            ]
        ]
    };

    // Kirim pesan ke Telegram dengan message_thread_id (jika topik tersedia)
    return sendTelegramMessage(adminChatId, messageBody, {
        parse_mode: "HTML",
        reply_markup: inlineKeyboard,
        message_thread_id: topicId || null
    });
}
