import fs from "node:fs";
import path from "node:path";
import {
    getChatSessionById,
    updateChatSessionMode,
    closeChatSession,
    insertChatMessage,
    supabaseAdmin,
    isSupabaseConfigured
} from "../../../lib/supabase.server";
import {
    answerCallbackQuery,
    sendTelegramMessage,
    closeTelegramForumTopic
} from "../../../lib/telegram.server";

export const prerender = false;

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

export const POST = async ({ request }) => {
    try {
        // 1. Verifikasi Header Secret Token Telegram (Zero-Trust)
        const webhookSecret = getEnv("TELEGRAM_WEBHOOK_SECRET");
        if (webhookSecret) {
            const incomingSecret = request.headers.get("x-telegram-bot-api-secret-token");
            if (incomingSecret !== webhookSecret) {
                console.warn("[Telegram Webhook] Unauthorized secret token detected");
                return new Response(JSON.stringify({ error: "Unauthorized" }), {
                    status: 403,
                    headers: { "Content-Type": "application/json" }
                });
            }
        }

        const update = await request.json().catch(() => null);
        if (!update) {
            return new Response(JSON.stringify({ ok: false, error: "Empty payload" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // ======================================================================
        // KASUS 1: PESAN TEKS DARI ADMIN (VIA FORUM TOPIC ATAU SWIPE REPLY)
        // ======================================================================
        if (update.message) {
            const message = update.message;

            // Pastikan mengabaikan pesan yang dikirim oleh bot sendiri
            if (message.from?.is_bot === true) {
                return new Response(JSON.stringify({ ok: true, ignored: "bot_message" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }

            // Abaikan service messages Telegram (forum_topic_created, forum_topic_closed, pinned, dll.)
            if (
                message.forum_topic_created ||
                message.forum_topic_closed ||
                message.forum_topic_reopened ||
                message.forum_topic_edited ||
                message.pinned_message
            ) {
                return new Response(JSON.stringify({ ok: true, ignored: "service_message" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const adminText = (message.text || message.caption || "").trim();
            if (!adminText) {
                return new Response(JSON.stringify({ ok: true, ignored: "empty_text" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const lowerText = adminText.toLowerCase();

            // ==================================================================
            // HELPER: /id, /chatid, /check
            // Menampilkan informasi Chat ID, Tipe Grup, dan Status Forum Topics
            // ==================================================================
            if (lowerText === "/id" || lowerText === "/chatid" || lowerText === "/check") {
                const isForum = Boolean(message.chat?.is_forum);
                const isSupergroup = message.chat?.type === "supergroup" && String(message.chat?.id).startsWith("-100");
                const currentAdminId = getEnv("TELEGRAM_ADMIN_CHAT_ID");

                const infoMsg = `
📍 <b>YASUI TELEGRAM CHAT INFO</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Chat ID:</b> <code>${message.chat.id}</code>
🏷️ <b>Nama:</b> ${message.chat.title || message.chat.first_name || "Chat"}
📂 <b>Tipe:</b> <code>${message.chat.type}</code>
💬 <b>Forum Topics:</b> ${isForum ? "✅ AKTIF" : "❌ NONAKTIF"}
⚙️ <b>Tergabung di .env:</b> ${String(currentAdminId) === String(message.chat.id) ? "✅ YA" : "❌ BELUM"}

${!isSupergroup ? "⚠️ <b>PERHATIAN:</b> Telegram Forum Topics <b>HANYA</b> didukung pada <b>Supergroup</b> (ID berawalan <code>-100...</code>). Chat ini adalah <code>" + message.chat.type + "</code>.\n\nUntuk mengaktifkan Forum Topics:\n1. Buat Grup Telegram baru (atau gunakan grup yang ada).\n2. Aktifkan opsi <b>Topics / Forum</b> di pengaturan grup (Edit Group -> Topics -> ON).\n3. Undang bot ke grup dan beri izin Admin (Manage Topics).\n4. Ketik <code>/setadmin</code> di grup tersebut!" : isForum ? "🎉 <b>SUPERGROUP FORUM VALID!</b>\nKetik <code>/setadmin</code> di grup ini untuk langsung mengaktifkannya sebagai grup resmi Yasui Game!" : "⚠️ Forum Topics belum aktif di grup ini. Buka Edit Group -> Topics -> Aktifkan (ON), lalu ketik <code>/setadmin</code>."}
`.trim();

                await sendTelegramMessage(message.chat.id, infoMsg, {
                    parse_mode: "HTML",
                    message_thread_id: message.message_thread_id || null
                });

                return new Response(JSON.stringify({ ok: true, action: "chat_info", chatId: message.chat.id }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }

            // ==================================================================
            // HELPER: /setadmin
            // Otomatis menetapkan grup ini sebagai TELEGRAM_ADMIN_CHAT_ID di .env
            // ==================================================================
            if (lowerText === "/setadmin" || lowerText.startsWith("/setadmin")) {
                const newChatId = String(message.chat.id);
                try {
                    const envPath = path.resolve(process.cwd(), ".env");
                    if (fs.existsSync(envPath)) {
                        let content = fs.readFileSync(envPath, "utf-8");
                        if (content.includes("TELEGRAM_ADMIN_CHAT_ID=")) {
                            content = content.replace(/^TELEGRAM_ADMIN_CHAT_ID=.*$/m, `TELEGRAM_ADMIN_CHAT_ID=${newChatId}`);
                        } else {
                            content += `\nTELEGRAM_ADMIN_CHAT_ID=${newChatId}\n`;
                        }
                        fs.writeFileSync(envPath, content, "utf-8");
                    }
                    if (typeof process !== "undefined" && process.env) {
                        process.env.TELEGRAM_ADMIN_CHAT_ID = newChatId;
                    }
                } catch (e) {
                    console.warn("[Telegram Webhook] Failed to auto-update .env with new chat ID:", e.message);
                }

                const isForum = Boolean(message.chat?.is_forum);
                await sendTelegramMessage(
                    message.chat.id,
                    `🎉 <b>Grup Admin Berhasil Ditetapkan!</b>\n━━━━━━━━━━━━━━━━━━━━━\n🆔 <b>Chat ID:</b> <code>${newChatId}</code>\n💬 <b>Forum Topics:</b> ${isForum ? "✅ AKTIF" : "⚠️ NONAKTIF (Aktifkan di Edit Group -> Topics)"}\n\nSekarang semua sesi live chat pembeli dan order akan otomatis membuat Forum Topic di grup ini!`,
                    {
                        parse_mode: "HTML",
                        message_thread_id: message.message_thread_id || null
                    }
                );

                return new Response(JSON.stringify({ ok: true, action: "set_admin", newChatId }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }

            // Pastikan pesan berasal dari grup Admin Telegram resmi jika TELEGRAM_ADMIN_CHAT_ID dikonfigurasi
            const currentAdminChatId = getEnv("TELEGRAM_ADMIN_CHAT_ID");
            if (currentAdminChatId && String(message.chat?.id) !== String(currentAdminChatId)) {
                return new Response(JSON.stringify({ ok: true, ignored: "unauthorized_chat" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }

            const threadId = message.message_thread_id || null;
            const replyTo = message.reply_to_message;
            let session = null;

            // 1. METODE UTAMA (VIA TOPIC ID):
            // Cek apakah message.message_thread_id ada. Jika ada, cari di tabel chat_sessions
            // baris yang memiliki telegram_topic_id === message.message_thread_id
            if (threadId && isSupabaseConfigured() && supabaseAdmin) {
                try {
                    const { data, error } = await supabaseAdmin
                        .from("chat_sessions")
                        .select("*")
                        .eq("telegram_topic_id", threadId)
                        .order("last_message_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (!error && data) {
                        session = data;
                    } else if (error) {
                        // Fallback jika telegram_topic_id bertipe text di database
                        const { data: strData } = await supabaseAdmin
                            .from("chat_sessions")
                            .select("*")
                            .eq("telegram_topic_id", String(threadId))
                            .order("last_message_at", { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        if (strData) session = strData;
                    }
                } catch (e) {
                    console.warn("[Telegram Webhook] Error finding session by topic_id:", e.message);
                }
            }

            // 2. METODE FALLBACK (VIA SWIPE REPLY):
            // Jika tidak ditemukan lewat message_thread_id, tetap dukung pencarian #SID_<uuid> dari reply_to_message.text
            if (!session && replyTo) {
                const parentText = replyTo.text || replyTo.caption || "";
                const match = parentText.match(/#SID_([a-zA-Z0-9_\-]+)/);
                if (match && match[1]) {
                    const sessionId = match[1];
                    session = await getChatSessionById(sessionId);
                }
            }

            // BEGITU SESSION DITEMUKAN:
            if (session) {
                const nowIso = new Date().toISOString();
                const lowerText = adminText.toLowerCase();

                // PERINTAH: /ai
                // Ubah kembali session.mode menjadi 'ai' dan kirim konfirmasi singkat di topik tersebut
                if (lowerText === "/ai" || lowerText.startsWith("/ai ")) {
                    await updateChatSessionMode(session.id, "ai");

                    await sendTelegramMessage(
                        message.chat.id,
                        "🤖 Mode AI kembali aktif untuk sesi ini.",
                        {
                            parse_mode: "HTML",
                            message_thread_id: threadId || null
                        }
                    );

                    return new Response(JSON.stringify({ ok: true, action: "ai_mode", sessionId: session.id }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                // PERINTAH: /close
                // Ubah session.mode menjadi 'closed' dan panggil API Telegram closeForumTopic untuk menutup topik
                if (lowerText === "/close" || lowerText.startsWith("/close ")) {
                    await closeChatSession(session.id);

                    // Panggil API Telegram closeForumTopic jika berada di forum thread
                    if (threadId) {
                        await closeTelegramForumTopic(message.chat.id, threadId);
                    }

                    await sendTelegramMessage(
                        message.chat.id,
                        `🔒 <b>Sesi Ditutup:</b> Sesi <code>#SID_${session.id}</code> telah diakhiri. Topik forum ditutup.`,
                        {
                            parse_mode: "HTML",
                            message_thread_id: threadId || null
                        }
                    );

                    return new Response(JSON.stringify({ ok: true, action: "closed", sessionId: session.id }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                // PESAN NORMAL ADMIN:
                // 1. Simpan pesan teks Admin ke tabel chat_messages (sender_role: 'admin', message: text)
                await insertChatMessage({
                    sessionId: session.id,
                    senderRole: "admin",
                    message: adminText,
                    telegramMsgId: message.message_id
                });

                // 2. Ubah chat_sessions.mode menjadi 'human' dan perbarui last_message_at
                await updateChatSessionMode(session.id, "human");

                // 3. Konfirmasi singkat balik ke Admin di topik yang sama
                await sendTelegramMessage(
                    message.chat.id,
                    `✅ <b>Pesan Terkirim ke Pembeli</b>\nSesi: <code>#SID_${session.id}</code>\nMode: 👨‍💻 <b>Admin Manual Aktif</b>`,
                    {
                        parse_mode: "HTML",
                        message_thread_id: threadId || null
                    }
                );

                return new Response(JSON.stringify({ ok: true, forwarded: true, sessionId: session.id }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            } else {
                // Sesi tidak ditemukan via threadId maupun swipe reply
                if (threadId || replyTo) {
                    await sendTelegramMessage(
                        message.chat.id,
                        `⚠️ <b>Sesi Tidak Ditemukan:</b> Topik atau pesan ini tidak terhubung ke sesi chat pembeli yang aktif.`,
                        {
                            parse_mode: "HTML",
                            message_thread_id: threadId || null
                        }
                    );
                }
            }
        }

        // ======================================================================
        // KASUS 2: CALLBACK QUERY DARI INLINE KEYBOARD (ACTION BUTTONS)
        // ======================================================================
        if (update.callback_query) {
            const cb = update.callback_query;
            const data = cb.data || "";
            const cbId = cb.id;
            const chatId = cb.message?.chat?.id;
            const threadId = cb.message?.message_thread_id || null;

            const [action, sessionId] = data.split(":");

            if (sessionId) {
                const session = await getChatSessionById(sessionId);
                const nowIso = new Date().toISOString();

                if (action === "takeover") {
                    await updateChatSessionMode(sessionId, "human");
                    await answerCallbackQuery(cbId, "👨‍💻 Mode Manual Aktif! Anda telah mengambil alih chat.", true);
                    if (chatId) {
                        await sendTelegramMessage(
                            chatId,
                            `👨‍💻 <b>Takeover Berhasil:</b> Sesi <code>#SID_${sessionId}</code> sekarang berada dalam kendali manual Admin. Balasan otomatis AI dinonaktifkan untuk sesi ini.`,
                            { parse_mode: "HTML", message_thread_id: threadId }
                        );
                    }
                    return new Response(JSON.stringify({ ok: true, action: "takeover" }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                if (action === "aimode") {
                    await updateChatSessionMode(sessionId, "ai");
                    await answerCallbackQuery(cbId, "🤖 Mode AI Diaktifkan Kembali.", true);
                    if (chatId) {
                        await sendTelegramMessage(
                            chatId,
                            `🤖 <b>Mode AI Aktif:</b> Sesi <code>#SID_${sessionId}</code> kembali dilayani oleh AI Yasui Game.`,
                            { parse_mode: "HTML", message_thread_id: threadId }
                        );
                    }
                    return new Response(JSON.stringify({ ok: true, action: "aimode" }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                if (action === "close") {
                    await closeChatSession(sessionId);
                    await answerCallbackQuery(cbId, "🔒 Sesi Chat Telah Ditutup.", true);
                    if (chatId) {
                        await sendTelegramMessage(
                            chatId,
                            `🔒 <b>Sesi Ditutup:</b> Sesi <code>#SID_${sessionId}</code> telah diakhiri. Topik forum ditutup.`,
                            { parse_mode: "HTML", message_thread_id: threadId }
                        );
                        if (threadId) {
                            await closeTelegramForumTopic(chatId, threadId);
                        }
                    }
                    return new Response(JSON.stringify({ ok: true, action: "close" }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    });
                }
            }

            await answerCallbackQuery(cbId, "Aksi diproses.");
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("[Telegram Webhook Error]:", err.message);
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
