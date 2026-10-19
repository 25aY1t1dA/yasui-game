import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Guard: Modul ini hanya boleh dijalankan di server-side context (Node.js / SSR Astro)
if (import.meta.env && import.meta.env.SSR === false) {
    throw new Error("Security Violation: Supabase server module can only be imported in server-side context.");
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

const SUPABASE_URL = getEnv("PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

export let supabaseAdmin = null;

if (isConfigured) {
    try {
        supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        });
    } catch (err) {
        console.warn("[Supabase Server] Failed to initialize Supabase client:", err.message);
        supabaseAdmin = null;
    }
}

export function isSupabaseConfigured() {
    return Boolean(supabaseAdmin);
}

// Normalizer untuk kompatibilitas nama field chat_sessions
function normalizeSession(s) {
    if (!s) return null;
    return {
        ...s,
        buyer_name: s.customer_name || s.buyer_name || "Guest",
        customer_name: s.customer_name || s.buyer_name || "Guest",
        buyer_email: s.customer_email || s.buyer_email || null,
        customer_email: s.customer_email || s.buyer_email || null,
        context_product: s.product_context || s.context_product || null,
        product_context: s.product_context || s.context_product || null,
        context_order_id: s.order_id || s.context_order_id || null,
        order_id: s.order_id || s.context_order_id || null,
        telegram_topic_id: s.telegram_topic_id || null,
        status: "active"
    };
}

// ==============================================================================
// IN-MEMORY FALLBACK STORE (Active when Supabase credentials not provided)
// ==============================================================================
const inMemorySessions = new Map();
const inMemoryMessages = new Map();

function generateId(prefix = "sid") {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ==============================================================================
// CHAT SESSION REPOSITORY
// ==============================================================================

/**
 * Mengambil atau membuat sesi chat aktif berdasarkan visitor_token
 * @param {string} visitorToken - Token unik pengunjung browser
 * @param {object} metadata - { buyerName, buyerEmail, buyerPhone, contextProduct, contextOrderId, lang }
 */
export async function getOrCreateChatSession(visitorToken, metadata = {}) {
    if (!visitorToken || typeof visitorToken !== "string") {
        throw new Error("Visitor token is required");
    }

    const cleanToken = visitorToken.trim().slice(0, 64);
    const nowIso = new Date().toISOString();

    const customerName = metadata.buyerName || metadata.customer_name || "Guest";
    const customerEmail = metadata.buyerEmail || metadata.customer_email || null;
    const productContext = metadata.contextProduct || metadata.product_context || null;
    const orderId = metadata.contextOrderId || metadata.order_id || null;
    const lang = metadata.lang === "en" ? "en" : "id";

    // 1. SUPABASE ACTIVE CLIENT
    if (isSupabaseConfigured()) {
        try {
            // Cari sesi berdasarkan visitor_token (terbaru)
            const { data: existing, error: selectErr } = await supabaseAdmin
                .from("chat_sessions")
                .select("*")
                .eq("visitor_token", cleanToken)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (selectErr) {
                console.warn("[Supabase] Error selecting chat_sessions:", selectErr.message);
            }

            if (existing) {
                const updates = {};
                if (customerName && customerName !== existing.customer_name && customerName !== "Guest") {
                    updates.customer_name = customerName;
                }
                if (customerEmail && customerEmail !== existing.customer_email) {
                    updates.customer_email = customerEmail;
                }
                if (productContext && productContext !== existing.product_context) {
                    updates.product_context = productContext;
                }
                if (orderId && orderId !== existing.order_id) {
                    updates.order_id = orderId;
                }
                if (lang && lang !== existing.lang) {
                    updates.lang = lang;
                }

                updates.last_message_at = nowIso;

                const { data: updated, error: updateErr } = await supabaseAdmin
                    .from("chat_sessions")
                    .update(updates)
                    .eq("id", existing.id)
                    .select()
                    .maybeSingle();

                if (!updateErr && updated) {
                    return { success: true, session: normalizeSession(updated) };
                }
                return { success: true, session: normalizeSession(existing) };
            }

            // Buat sesi baru
            const newSession = {
                visitor_token: cleanToken,
                customer_name: customerName,
                customer_email: customerEmail,
                order_id: orderId,
                product_context: productContext,
                lang: lang,
                mode: "ai",
                risk_score: 0,
                last_message_at: nowIso,
                created_at: nowIso
            };

            const { data: inserted, error: insertErr } = await supabaseAdmin
                .from("chat_sessions")
                .insert([newSession])
                .select()
                .single();

            if (insertErr) {
                console.warn("[Supabase] Insert session error, falling back to memory:", insertErr.message);
            } else if (inserted) {
                return { success: true, session: normalizeSession(inserted) };
            }
        } catch (err) {
            console.warn("[Supabase] Session exception, falling back to memory:", err.message);
        }
    }

    // 2. IN-MEMORY FALLBACK
    for (const sess of inMemorySessions.values()) {
        if (sess.visitor_token === cleanToken) {
            if (customerName && customerName !== "Guest") sess.customer_name = customerName;
            if (customerEmail) sess.customer_email = customerEmail;
            if (productContext) sess.product_context = productContext;
            if (orderId) sess.order_id = orderId;
            if (lang) sess.lang = lang;
            sess.last_message_at = nowIso;
            return { success: true, session: normalizeSession(sess), fallback: true };
        }
    }

    const fallbackSession = {
        id: generateId("mem_sess"),
        visitor_token: cleanToken,
        mode: "ai",
        customer_name: customerName,
        customer_email: customerEmail,
        product_context: productContext,
        order_id: orderId,
        lang: lang,
        risk_score: 0,
        telegram_topic_id: null,
        last_message_at: nowIso,
        created_at: nowIso
    };

    inMemorySessions.set(fallbackSession.id, fallbackSession);
    return { success: true, session: normalizeSession(fallbackSession), fallback: true };
}

/**
 * Ambil sesi berdasarkan ID
 */
export async function getChatSessionById(sessionId) {
    if (!sessionId) return null;

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabaseAdmin
                .from("chat_sessions")
                .select("*")
                .eq("id", sessionId)
                .maybeSingle();
            if (!error && data) return normalizeSession(data);
        } catch (e) {
            console.warn("[Supabase] getChatSessionById error:", e.message);
        }
    }

    return normalizeSession(inMemorySessions.get(sessionId)) || null;
}

/**
 * Update mode sesi ('ai' atau 'human')
 */
export async function updateChatSessionMode(sessionId, mode) {
    const validModes = ["ai", "human"];
    if (!validModes.includes(mode)) {
        throw new Error(`Invalid mode: ${mode}`);
    }

    const nowIso = new Date().toISOString();

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabaseAdmin
                .from("chat_sessions")
                .update({ mode, last_message_at: nowIso })
                .eq("id", sessionId)
                .select()
                .maybeSingle();
            if (!error && data) return normalizeSession(data);
        } catch (e) {
            console.warn("[Supabase] updateChatSessionMode error:", e.message);
        }
    }

    const sess = inMemorySessions.get(sessionId);
    if (sess) {
        sess.mode = mode;
        sess.last_message_at = nowIso;
        return normalizeSession(sess);
    }
    return null;
}

/**
 * Tutup sesi chat
 */
export async function closeChatSession(sessionId) {
    const nowIso = new Date().toISOString();

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabaseAdmin
                .from("chat_sessions")
                .update({ last_message_at: nowIso })
                .eq("id", sessionId)
                .select()
                .maybeSingle();
            if (!error && data) return normalizeSession(data);
        } catch (e) {
            console.warn("[Supabase] closeChatSession error:", e.message);
        }
    }

    const sess = inMemorySessions.get(sessionId);
    if (sess) {
        sess.last_message_at = nowIso;
        return normalizeSession(sess);
    }
    return null;
}

// ==============================================================================
// CHAT MESSAGES REPOSITORY
// ==============================================================================

/**
 * Simpan pesan baru ke chat_messages
 * @param {object} param0 - { sessionId, senderRole, message, telegramMsgId, id }
 */
export async function insertChatMessage({
    id = null,
    sessionId,
    senderRole = "buyer",
    message,
    riskScore = 0,
    telegramMsgId = null
}) {
    if (!sessionId || !message) {
        throw new Error("sessionId and message are required");
    }

    const validRoles = ["buyer", "ai", "admin", "system"];
    const role = validRoles.includes(senderRole) ? senderRole : "buyer";
    const nowIso = new Date().toISOString();

    const insertPayload = {
        session_id: sessionId,
        sender_role: role,
        message: String(message).trim(),
        telegram_msg_id: telegramMsgId ? String(telegramMsgId) : null,
        created_at: nowIso
    };

    const isUuid = typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUuid) {
        insertPayload.id = id;
    }


    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabaseAdmin
                .from("chat_messages")
                .insert([insertPayload])
                .select()
                .single();

            if (!error && data) {
                return { success: true, message: data };
            }
            console.warn("[Supabase] insertChatMessage error, falling back:", error?.message);
        } catch (e) {
            console.warn("[Supabase] insertChatMessage exception:", e.message);
        }
    }

    // In-memory fallback
    const fallbackMsg = {
        id: id || generateId("msg"),
        ...insertPayload
    };

    if (!inMemoryMessages.has(sessionId)) {
        inMemoryMessages.set(sessionId, []);
    }
    const list = inMemoryMessages.get(sessionId);
    list.push(fallbackMsg);
    if (list.length > 100) list.shift();

    return { success: true, message: fallbackMsg, fallback: true };
}

/**
 * Ambil riwayat chat pesan untuk sebuah sesi
 * @param {string} sessionId
 * @param {number} limit
 */
export async function getChatMessages(sessionId, limit = 50) {
    if (!sessionId) return [];

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabaseAdmin
                .from("chat_messages")
                .select("id, session_id, sender_role, message, telegram_msg_id, created_at")
                .eq("session_id", sessionId)
                .order("created_at", { ascending: true })
                .limit(limit);

            if (!error && Array.isArray(data)) {
                return data;
            }
            console.warn("[Supabase] getChatMessages error:", error?.message);
        } catch (e) {
            console.warn("[Supabase] getChatMessages exception:", e.message);
        }
    }

    const list = inMemoryMessages.get(sessionId) || [];
    return list.slice(-limit);
}
