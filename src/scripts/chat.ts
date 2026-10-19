import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import { translations } from "../lib/translations";

// ==============================================================================
// STATE CHAT FRONTEND & IDENTITAS PENGUNJUNG
// ==============================================================================
let supabaseClient: SupabaseClient | null = null;
let realtimeChannel: RealtimeChannel | null = null;
let currentSessionId: string | null = null;
let currentSessionMode: "ai" | "human" = "ai";
let isModalOpen = false;
let isFetchingHistory = false;
let isSending = false;
let pollInterval: any = null;
let activeProductContext: string | null = null;
let activeOrderId: string | null = null;
const renderedMessageIds = new Set<string>();

/**
 * Dapatkan atau terbitkan UUID unik visitor token di localStorage
 */
export function getOrCreateVisitorToken(): string {
    let token = "";
    try {
        token = localStorage.getItem("yasui_visitor_token") || "";
    } catch {}

    if (!token || token.length < 16) {
        token = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `yg_${Math.random().toString(36).substring(2, 12)}_${Date.now().toString(36)}`;
        try {
            localStorage.setItem("yasui_visitor_token", token);
        } catch {}
    }
    return token.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 64);
}

/**
 * Dapatkan bahasa aktif saat ini ('id' atau 'en')
 */
function getLanguage(): "id" | "en" {
    let lang = "id";
    try {
        const stored = localStorage.getItem("yasui_lang");
        if (stored === "en" || stored === "id") lang = stored;
    } catch {}
    return lang as "id" | "en";
}

/**
 * Helper terjemahan lokal dwi-bahasa
 */
function t(key: string, fallback = ""): string {
    const lang = getLanguage();
    const dict = (translations as Record<string, Record<string, string>>)[lang] || (translations as any)["id"];
    return dict?.[key] || fallback || key;
}

/**
 * Format timestamp jam:menit
 */
function formatTime(isoString?: string): string {
    try {
        const d = isoString ? new Date(isoString) : new Date();
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
        return "";
    }
}

/**
 * Format markdown ringan & sanitasi teks
 */
function formatMessageBody(raw: string): string {
    if (!raw) return "";
    let safe = String(raw)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Markdown bold **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Markdown links [label](url)
    safe = safe.replace(/\[(.*?)\]\((.*?)\)/g, (_match, label, url) => {
        const cleanUrl = url.replace(/["'<>]/g, "");
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-[#00E5FF] underline hover:text-[#38BDF8]">${label}</a>`;
    });

    // Newlines
    safe = safe.replace(/\n/g, "<br />");
    return safe;
}

/**
 * Inisialisasi client Supabase publik untuk koneksi Realtime
 */
function getSupabaseClient(): SupabaseClient | null {
    if (supabaseClient) return supabaseClient;
    const url = (import.meta as any).env?.PUBLIC_SUPABASE_URL || (window as any).__YASUI_CONFIG__?.supabaseUrl;
    const key = (import.meta as any).env?.PUBLIC_SUPABASE_ANON_KEY || (window as any).__YASUI_CONFIG__?.supabaseAnonKey;

    if (!url || !key) return null;

    try {
        supabaseClient = createClient(url, key, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        });
        return supabaseClient;
    } catch (err) {
        console.warn("[Chat Frontend] Supabase init warning:", err);
        return null;
    }
}

/**
 * Update UI Header Live Chat (Mode AI Instant Guard vs Connected to Live Admin)
 */
export function updateChatHeaderUI(mode: "ai" | "human"): void {
    currentSessionMode = mode;
    const avatar = document.getElementById("livechat-avatar");
    const avatarIcon = document.getElementById("livechat-avatar-icon");
    const avatarStatus = document.getElementById("livechat-avatar-status");
    const headerTitle = document.getElementById("livechat-header-title");
    const headerBadge = document.getElementById("livechat-header-badge");
    const statusDot = document.getElementById("livechat-status-dot");
    const statusText = document.getElementById("livechat-status-text");
    const reqHumanBtn = document.getElementById("livechat-request-human-btn");

    if (mode === "human") {
        // MODE ADMIN MANUAL (TERKONEKSI DENGAN TELEGRAM ADMIN)
        if (avatar) {
            avatar.className = "w-9 h-9 rounded-md bg-[#11131A] border border-emerald-500/40 flex items-center justify-center text-emerald-400 relative shrink-0 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.15)]";
        }
        if (avatarIcon) {
            avatarIcon.className = "i-lucide-shield-check text-lg text-emerald-400";
        }
        if (avatarStatus) {
            avatarStatus.className = "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-[#090A0F] animate-pulse";
        }
        if (headerTitle) {
            headerTitle.innerText = t("chat.mode_human_title", "Admin Resmi Yasui Game");
        }
        if (headerBadge) {
            headerBadge.className = "font-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 font-semibold shadow-[0_0_8px_rgba(16,185,129,0.2)]";
            headerBadge.innerText = t("chat.badge_admin", "🛡️ OFFICIAL ADMIN");
        }
        if (statusDot) {
            statusDot.className = "w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0";
        }
        if (statusText) {
            statusText.innerText = t("chat.mode_human_status", "🛡️ Terhubung ke Admin Live (Telegram)");
            statusText.className = "text-[10px] text-emerald-400 font-mono truncate";
        }
        if (reqHumanBtn) {
            reqHumanBtn.innerHTML = `
                <div class="i-lucide-check-circle text-xs text-emerald-400"></div>
                <span class="hidden sm:inline">${t("chat.request_human_connected", "Admin Terhubung")}</span>
            `;
            reqHumanBtn.classList.add("border-emerald-500/40", "text-emerald-400", "cursor-default", "opacity-80");
            reqHumanBtn.classList.remove("hover:text-[#00E5FF]");
        }
    } else {
        // MODE AI INSTANT GUARD
        if (avatar) {
            avatar.className = "w-9 h-9 rounded-md bg-[#161922] border border-[#222634] flex items-center justify-center text-[#00E5FF] relative shrink-0 transition-colors";
        }
        if (avatarIcon) {
            avatarIcon.className = "i-lucide-bot text-lg text-[#00E5FF]";
        }
        if (avatarStatus) {
            avatarStatus.className = "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-[#090A0F]";
        }
        if (headerTitle) {
            headerTitle.innerText = t("chat.mode_ai_title", "Yasui AI Assistant");
        }
        if (headerBadge) {
            headerBadge.className = "font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30 font-semibold";
            headerBadge.innerText = t("chat.badge_ai", "⚡ YASUI AI");
        }
        if (statusDot) {
            statusDot.className = "w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0";
        }
        if (statusText) {
            statusText.innerText = t("chat.mode_ai_status", "⚡ AI Instant Guard • Respon 24/7");
            statusText.className = "text-[10px] text-emerald-400 font-mono truncate";
        }
        if (reqHumanBtn) {
            reqHumanBtn.innerHTML = `
                <div class="i-lucide-user-check text-xs text-emerald-400"></div>
                <span class="hidden sm:inline">${t("chat.request_human_btn", "Minta Admin")}</span>
            `;
            reqHumanBtn.classList.remove("border-emerald-500/40", "cursor-default", "opacity-80");
            reqHumanBtn.classList.add("text-[#94A3B8]", "hover:text-[#00E5FF]");
        }
    }
}

/**
 * Scroll kontainer pesan ke bawah
 */
function scrollToBottom(): void {
    const container = document.getElementById("livechat-messages");
    if (container) {
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }
}

/**
 * Tampilkan / sembunyikan indikator sedang mengetik
 */
function showTypingIndicator(show: boolean): void {
    const typing = document.getElementById("livechat-typing");
    if (!typing) return;
    if (show) {
        typing.classList.remove("hidden");
        typing.classList.add("flex");
        scrollToBottom();
    } else {
        typing.classList.remove("flex");
        typing.classList.add("hidden");
    }
}

/**
 * Render elemen bubble pesan ke dalam kontainer (Anti-Duplikasi Total)
 */
export function appendMessage(msg: {
    id: string;
    sender_role: "buyer" | "ai" | "admin" | "system" | string;
    message: string;
    created_at?: string;
}): void {
    if (!msg || !msg.message) return;
    const container = document.getElementById("livechat-messages");
    if (!container) return;

    // 1. DEDUPLIKASI LAYER 1: Cek Set renderedMessageIds
    if (msg.id && renderedMessageIds.has(msg.id)) {
        return;
    }

    // 2. DEDUPLIKASI LAYER 2: Cek keberadaan atribut data-msg-id langsung di DOM
    if (msg.id) {
        try {
            const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
                ? CSS.escape(msg.id)
                : msg.id.replace(/["\\]/g, "\\$&");
            const existingEl = container.querySelector(`[data-msg-id="${escapedId}"]`);
            if (existingEl) {
                renderedMessageIds.add(msg.id);
                return;
            }
        } catch {}
    }

    if (msg.id) renderedMessageIds.add(msg.id);

    const time = formatTime(msg.created_at);
    const bodyHtml = formatMessageBody(msg.message);
    const wrapper = document.createElement("div");
    if (msg.id) wrapper.setAttribute("data-msg-id", msg.id);

    if (msg.sender_role === "buyer") {
        // BUBBLE PESAN PEMBELI: Rata kanan, latar #00E5FF]/15 dengan border #00E5FF]/40
        wrapper.className = "flex justify-end";
        wrapper.innerHTML = `
            <div class="bg-[#00E5FF]/15 border border-[#00E5FF]/40 rounded-lg rounded-tr-none p-3 text-[#F8FAFC] text-xs leading-relaxed max-w-[85%] text-left shadow-xs">
                <div class="break-words">${bodyHtml}</div>
                <div class="text-[9px] text-[#00E5FF]/70 font-mono mt-1 text-right tabular-nums">${time}</div>
            </div>
        `;
    } else if (msg.sender_role === "admin") {
        // BUBBLE PESAN ADMIN RESMI TELEGRAM: Rata kiri, latar #11131A dengan border emerald #10B981]/40 & badge 🛡️ OFFICIAL ADMIN
        wrapper.className = "flex items-start gap-2 max-w-[85%]";
        wrapper.innerHTML = `
            <div class="w-6 h-6 rounded bg-[#11131A] border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-[10px] shrink-0 mt-0.5 font-bold font-mono">
                🛡️
            </div>
            <div class="bg-[#11131A] border border-emerald-500/40 rounded-lg rounded-tl-none p-3 text-xs leading-relaxed shadow-[0_0_12px_rgba(16,185,129,0.12)] text-left">
                <div class="flex items-center gap-1 font-mono text-[9px] text-emerald-400 font-semibold mb-1">
                    <span>${t("chat.badge_admin", "🛡️ OFFICIAL ADMIN")}</span>
                </div>
                <div class="text-[#F8FAFC] leading-relaxed break-words">${bodyHtml}</div>
                <div class="text-[9px] text-emerald-400/70 font-mono mt-1 tabular-nums">${time}</div>
            </div>
        `;
    } else if (msg.sender_role === "system") {
        // BUBBLE PESAN SISTEM (Konteks Produk, Info Sesi, dll.)
        wrapper.className = "flex justify-center my-1";
        wrapper.innerHTML = `
            <div class="text-[10px] font-mono text-[#94A3B8] bg-[#0D0F15] border border-[#222634] px-2.5 py-1 rounded">
                ${bodyHtml}
            </div>
        `;
    } else {
        // BUBBLE PESAN AI ASSISTANT: Rata kiri, latar #161922 dengan border #222634 & badge ⚡ YASUI AI
        wrapper.className = "flex items-start gap-2 max-w-[85%]";
        wrapper.innerHTML = `
            <div class="w-6 h-6 rounded bg-[#161922] border border-[#222634] text-[#00E5FF] flex items-center justify-center text-[10px] shrink-0 mt-0.5 font-bold font-mono">
                ⚡
            </div>
            <div class="bg-[#161922] border border-[#222634] rounded-lg rounded-tl-none p-3 text-xs leading-relaxed shadow-xs text-left">
                <div class="flex items-center gap-1 font-mono text-[9px] text-[#00E5FF] font-semibold mb-1">
                    <span>${t("chat.badge_ai", "⚡ YASUI AI")}</span>
                </div>
                <div class="text-[#F8FAFC] leading-relaxed break-words">${bodyHtml}</div>
                <div class="text-[9px] text-[#64748B] font-mono mt-1 tabular-nums">${time}</div>
            </div>
        `;
    }

    // Sisipkan sebelum quick actions container jika ada
    const quickActions = document.getElementById("livechat-quick-actions");
    if (quickActions && container.contains(quickActions)) {
        container.insertBefore(wrapper, quickActions);
    } else {
        container.appendChild(wrapper);
    }
}

/**
 * Muat riwayat percakapan dari backend /api/chat/history (Mendukung Threading Pesanan)
 */
export async function loadChatHistory(token: string): Promise<void> {
    if (isFetchingHistory) return;
    isFetchingHistory = true;

    try {
        const lang = getLanguage();
        let url = `/api/chat/history?visitor_token=${encodeURIComponent(token)}&lang=${lang}`;
        if (activeOrderId) {
            url += `&order_id=${encodeURIComponent(activeOrderId)}`;
        }

        const res = await fetch(url, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });

        if (!res.ok) {
            console.warn("[Chat Frontend] History fetch responded with status:", res.status);
            return;
        }

        const data = await res.json();
        if (data?.success && data?.session) {
            currentSessionId = data.session.id;
            updateChatHeaderUI(data.session.mode || "ai");

            if (Array.isArray(data.messages)) {
                for (const msg of data.messages) {
                    if (msg.id && !renderedMessageIds.has(msg.id)) {
                        appendMessage(msg);
                    }
                }
                scrollToBottom();
            }
        }
    } catch (err: any) {
        console.warn("[Chat Frontend] Error loading chat history:", err.message);
    } finally {
        isFetchingHistory = false;
    }
}

/**
 * Berlangganan Supabase Realtime (postgres_changes) pada tabel chat_messages
 */
function setupSupabaseRealtime(sessionId: string): void {
    if (!sessionId) return;
    const client = getSupabaseClient();
    if (!client) return;

    teardownSupabaseRealtime();

    try {
        realtimeChannel = client
            .channel(`chat_messages:${sessionId}`)
            .on(
                "postgres_changes" as any,
                {
                    event: "INSERT",
                    schema: "public",
                    table: "chat_messages",
                    filter: `session_id=eq.${sessionId}`
                },
                (payload: any) => {
                    const newMsg = payload?.new;
                    if (newMsg && !renderedMessageIds.has(newMsg.id)) {
                        appendMessage(newMsg);
                        scrollToBottom();
                        if (newMsg.sender_role === "admin") {
                            updateChatHeaderUI("human");
                        }
                    }
                }
            )
            .subscribe((status: string) => {
                if (status === "CHANNEL_ERROR") {
                    console.warn("[Chat Realtime] Subscription issue, falling back to polling.");
                }
            });
    } catch (err: any) {
        console.warn("[Chat Realtime] Exception subscribing to channel:", err.message);
    }
}

/**
 * Putus langganan Supabase Realtime saat modal ditutup
 */
function teardownSupabaseRealtime(): void {
    if (realtimeChannel && supabaseClient) {
        try {
            supabaseClient.removeChannel(realtimeChannel);
        } catch {}
        realtimeChannel = null;
    }
}

/**
 * Polling berkala (3.5 detik) sebagai fallback cerdas saat modal terbuka
 */
function startPolling(token: string): void {
    stopPolling();
    pollInterval = setInterval(async () => {
        if (!isModalOpen || isFetchingHistory) return;
        try {
            const lang = getLanguage();
            let url = `/api/chat/history?visitor_token=${encodeURIComponent(token)}&lang=${lang}`;
            if (activeOrderId) {
                url += `&order_id=${encodeURIComponent(activeOrderId)}`;
            }

            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            if (data?.success) {
                if (data.session) {
                    currentSessionId = data.session.id;
                    if (data.session.mode && data.session.mode !== currentSessionMode) {
                        updateChatHeaderUI(data.session.mode);
                    }
                }
                if (Array.isArray(data.messages)) {
                    let hasNew = false;
                    for (const m of data.messages) {
                        if (m.id && !renderedMessageIds.has(m.id)) {
                            appendMessage(m);
                            hasNew = true;
                        }
                    }
                    if (hasNew) {
                        scrollToBottom();
                    }
                }
            }
        } catch {
            // Fail silently on background poll
        }
    }, 3500);
}

function stopPolling(): void {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

/**
 * Dapatkan elemen input pesan (mendukung textarea #chat-input dan alias #livechat-input)
 */
export function getChatInput(): HTMLTextAreaElement | HTMLInputElement | null {
    return (document.getElementById("chat-input") || document.getElementById("livechat-input")) as any;
}

/**
 * Ambil daftar nomor pesanan riwayat pengguna dari localStorage
 */
export function getRecentOrders(): string[] {
    const list = new Set<string>();
    try {
        const stored = localStorage.getItem("yasui_recent_orders");
        if (stored) {
            const arr = JSON.parse(stored);
            if (Array.isArray(arr)) {
                arr.forEach((id) => {
                    const clean = String(id).trim().replace(/[^a-zA-Z0-9_\-]/g, "");
                    if (clean) list.add(clean);
                });
            }
        }
        const txs = localStorage.getItem("yasui_transactions");
        if (txs) {
            const arr = JSON.parse(txs);
            if (Array.isArray(arr)) {
                arr.forEach((tx) => {
                    const id = tx.orderId || tx.id;
                    if (id) {
                        const clean = String(id).trim().replace(/[^a-zA-Z0-9_\-]/g, "");
                        if (clean) list.add(clean);
                    }
                });
            }
        }
    } catch {}
    return Array.from(list);
}

/**
 * Simpan nomor order ke daftar riwayat pesanan localStorage
 */
export function saveRecentOrder(orderId: string): void {
    if (!orderId) return;
    const clean = String(orderId).trim().replace(/[^a-zA-Z0-9_\-]/g, "");
    if (!clean) return;
    try {
        const existing = getRecentOrders().filter((id) => id !== clean);
        existing.unshift(clean);
        localStorage.setItem("yasui_recent_orders", JSON.stringify(existing.slice(0, 10)));
    } catch {}
}

/**
 * Render opsi dropdown pemilih thread percakapan (Pertanyaan Umum vs Order #ID)
 */
export function renderThreadSelector(): void {
    const selector = document.getElementById("livechat-thread-selector") as HTMLSelectElement | null;
    if (!selector) return;

    const currentVal = activeOrderId || "general";
    const recent = getRecentOrders();

    let html = `<option value="general">${t("chat.thread_general", "💬 Pertanyaan Umum / Produk")}</option>`;
    if (recent.length > 0) {
        recent.forEach((id) => {
            html += `<option value="${id}">${t("chat.thread_order_prefix", "📦 Order #")}${id}</option>`;
        });
    }
    if (activeOrderId && !recent.includes(activeOrderId)) {
        html += `<option value="${activeOrderId}">${t("chat.thread_order_prefix", "📦 Order #")}${activeOrderId}</option>`;
    }

    selector.innerHTML = html;
    selector.value = currentVal;
}

/**
 * Bersihkan bubble pesan di DOM kecuali pesan welcome bawaan
 */
function clearChatMessagesDom(): void {
    const container = document.getElementById("livechat-messages");
    if (!container) return;
    renderedMessageIds.clear();
    renderedMessageIds.add("welcome-1");
    renderedMessageIds.add("welcome-2");

    const items = Array.from(container.children);
    for (const el of items) {
        const msgId = el.getAttribute("data-msg-id");
        const isQuick = el.id === "livechat-quick-actions";
        if (msgId === "welcome-1" || msgId === "welcome-2" || isQuick) {
            continue;
        }
        el.remove();
    }
}

/**
 * Tangani perpindahan thread via dropdown Context Bar
 */
export async function handleChatThreadChange(selectedValue: string): Promise<void> {
    const newOrderId = selectedValue === "general" ? null : selectedValue;
    if (newOrderId === activeOrderId) return;

    activeOrderId = newOrderId;
    if (activeOrderId) {
        saveRecentOrder(activeOrderId);
    }
    updateContextBarUI();

    clearChatMessagesDom();

    const baseToken = getOrCreateVisitorToken();
    const effectiveToken = activeOrderId ? `${baseToken}__order_${activeOrderId}` : baseToken;

    stopPolling();
    teardownSupabaseRealtime();

    await loadChatHistory(effectiveToken);

    if (currentSessionId) {
        setupSupabaseRealtime(currentSessionId);
    }
    startPolling(effectiveToken);
    scrollToBottom();
}

/**
 * Update atau hapus konteks produk & pesanan pada UI modal
 */
export function updateContextBarUI(): void {
    renderThreadSelector();

    // 1. Chip Produk
    const chip = document.getElementById("livechat-product-chip");
    const nameEl = document.getElementById("livechat-product-name");
    if (chip && nameEl) {
        if (activeProductContext) {
            nameEl.innerText = activeProductContext;
            chip.classList.remove("hidden");
            chip.classList.add("flex");
        } else {
            chip.classList.remove("flex");
            chip.classList.add("hidden");
        }
    }

    // 2. Banner Sesi Khusus Order
    const banner = document.getElementById("livechat-order-banner");
    const bannerId = document.getElementById("livechat-order-banner-id");
    const bannerText = document.getElementById("livechat-order-banner-text");
    if (banner && bannerId) {
        if (activeOrderId) {
            bannerId.innerText = activeOrderId;
            if (bannerText) {
                const template = t("chat.order_session_banner", "🔒 Sesi Khusus Order #{id} — Riwayat percakapan ini tercatat resmi untuk jaminan garansi & bantuan pesanan.");
                bannerText.innerText = template.replace("{id}", activeOrderId);
            }
            banner.classList.remove("hidden");
            banner.classList.add("flex");
        } else {
            banner.classList.remove("flex");
            banner.classList.add("hidden");
        }
    }
}

export function clearChatProductContext(): void {
    activeProductContext = null;
    updateContextBarUI();
}

export function setChatOrderContext(orderId: string | null): void {
    activeOrderId = orderId ? String(orderId).trim().replace(/[^a-zA-Z0-9_\-]/g, "") : null;
    if (activeOrderId) {
        saveRecentOrder(activeOrderId);
    }
    updateContextBarUI();
}

export function clearChatOrderContext(): void {
    activeOrderId = null;
    updateContextBarUI();
}

/**
 * Buka modal Web Chat (HANYA saat dipicu oleh aksi/klik pengguna!)
 * Mendukung Contextual Threading untuk produk dan order_id dispute.
 */
export async function openLiveChatModal(initialProductContext?: string, orderId?: string): Promise<void> {
    const modal = document.getElementById("global-livechat-modal");
    if (!modal) return;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    modal.setAttribute("aria-hidden", "false");
    isModalOpen = true;

    // 1. Deteksi Order ID (Parameter eksplisit -> URL query params)
    if (orderId) {
        activeOrderId = String(orderId).trim().replace(/[^a-zA-Z0-9_\-]/g, "");
        saveRecentOrder(activeOrderId);
    } else if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const detectedOrder = urlParams.get("order_id") || urlParams.get("id");
        if (detectedOrder) {
            activeOrderId = detectedOrder.trim().replace(/[^a-zA-Z0-9_\-]/g, "");
            saveRecentOrder(activeOrderId);
        }
    }

    // 2. Deteksi Konteks Produk (Parameter eksplisit -> Atribut data -> Halaman produk)
    if (initialProductContext) {
        activeProductContext = initialProductContext;
    } else {
        const prodMain = document.querySelector("[data-product-title]");
        const detectedTitle = prodMain?.getAttribute("data-product-title");
        if (detectedTitle) {
            activeProductContext = detectedTitle;
        } else if (typeof window !== "undefined" && window.location.pathname.startsWith("/product/")) {
            activeProductContext = document.title ? document.title.replace(" - Yasui Game", "").trim() : window.location.pathname;
        }
    }

    updateContextBarUI();

    const baseToken = getOrCreateVisitorToken();
    const effectiveToken = activeOrderId ? `${baseToken}__order_${activeOrderId}` : baseToken;

    await loadChatHistory(effectiveToken);

    if (currentSessionId) {
        setupSupabaseRealtime(currentSessionId);
    }
    startPolling(effectiveToken);

    scrollToBottom();
    setTimeout(() => {
        getChatInput()?.focus();
    }, 100);
}

/**
 * Tutup modal Web Chat & hentikan langganan koneksi agar hemat resource
 */
export function closeLiveChatModal(): void {
    const modal = document.getElementById("global-livechat-modal");
    if (modal) {
        modal.classList.remove("flex");
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
    }
    isModalOpen = false;
    stopPolling();
    teardownSupabaseRealtime();
}

/**
 * Kirim pesan chat cepat via tombol quick reply
 */
export function sendQuickChatMessage(text: string): void {
    const input = getChatInput();
    if (input) {
        input.value = text;
        handleLiveChatSubmit();
    }
}

/**
 * Minta bantuan Admin Manusia
 */
export function requestHumanAdmin(): void {
    const msg = t("chat.human_requested_msg", "Halo Admin, saya ingin berbicara langsung dengan Admin Manusia mengenai produk / pesanan saya.");
    sendQuickChatMessage(msg);
}

/**
 * Tangani pengiriman form pesan pembeli ke /api/chat/send
 * Dilengkapi Lock isSending, Hard Character Limit 400, dan Anti-Duplikasi ID Presisi.
 */
export async function handleLiveChatSubmit(e?: Event): Promise<void> {
    if (e) e.preventDefault();
    if (isSending) return; // Mencegah double click / submit paralel

    const input = getChatInput();
    const sendBtn = document.getElementById("livechat-send-btn") as HTMLButtonElement | null;
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    // Hard Limit 400 Karakter di UI
    if (text.length > 400) {
        alert(t("chat.char_limit_exceeded", "Pesan maksimal 400 karakter."));
        return;
    }

    // Aktifkan Lock isSending & Nonaktifkan Tombol
    isSending = true;
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.classList.add("opacity-50", "cursor-not-allowed");
    }
    input.value = "";
    input.style.height = "auto";
    const charCounter = document.getElementById("chat-char-counter");
    if (charCounter) {
        charCounter.innerText = "0 / 400";
        charCounter.className = "text-[#64748B] tabular-nums";
    }

    const baseToken = getOrCreateVisitorToken();
    const lang = getLanguage();
    const clientMsgId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `cmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;


    // 1. Tampilkan bubble pembeli secara optimis (appendMessage otomatis mencatat ke renderedMessageIds)
    appendMessage({
        id: clientMsgId,
        sender_role: "buyer",
        message: text,
        created_at: new Date().toISOString()
    });
    scrollToBottom();
    showTypingIndicator(true);

    try {
        const payload: Record<string, any> = {
            visitor_token: baseToken,
            client_msg_id: clientMsgId,
            message: text,
            lang: lang
        };

        if (activeOrderId) {
            payload.order_id = activeOrderId;
            payload.context_order_id = activeOrderId;
        }

        if (activeProductContext) {
            payload.context_product = activeProductContext;
        } else if (typeof window !== "undefined" && window.location.pathname.startsWith("/product/")) {
            payload.context_product = document.title ? document.title.replace(" - Yasui Game", "").trim() : window.location.pathname;
        }

        const res = await fetch("/api/chat/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        showTypingIndicator(false);

        if (res.status === 429) {
            const errData = await res.json().catch(() => ({}));
            appendMessage({
                id: `sys_${Date.now()}`,
                sender_role: "system",
                message: errData.error || t("chat.rate_limited", "Terlalu cepat. Mohon tunggu beberapa detik sebelum mengirim lagi."),
                created_at: new Date().toISOString()
            });
            scrollToBottom();
            return;
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            appendMessage({
                id: `sys_${Date.now()}`,
                sender_role: "system",
                message: errData.error || t("chat.error_send", "Gagal mengirim pesan. Silakan coba lagi."),
                created_at: new Date().toISOString()
            });
            scrollToBottom();
            return;
        }

        const data = await res.json();
        if (data?.success) {
            // Sinkronkan ID pembeli backend dengan elemen DOM optimis
            if (data.buyer_msg_id) {
                renderedMessageIds.add(data.buyer_msg_id);
                if (data.buyer_msg_id !== clientMsgId) {
                    const container = document.getElementById("livechat-messages");
                    const buyerEl = container?.querySelector(`[data-msg-id="${clientMsgId}"]`);
                    if (buyerEl) {
                        buyerEl.setAttribute("data-msg-id", data.buyer_msg_id);
                    }
                }
            }

            if (data.mode === "human") {
                updateChatHeaderUI("human");
                if (data.message) {
                    appendMessage({
                        id: `sys_${Date.now()}`,
                        sender_role: "system",
                        message: data.message,
                        created_at: new Date().toISOString()
                    });
                }
            } else if (data.reply) {
                const aiMsgId = data.ai_msg_id || `ai_${Date.now()}`;
                appendMessage({
                    id: aiMsgId,
                    sender_role: "ai",
                    message: data.reply,
                    created_at: new Date().toISOString()
                });
            }

            // Pastikan realtime channel terhubung jika sebelumnya belum ada sesi
            if (!realtimeChannel && currentSessionId) {
                setupSupabaseRealtime(currentSessionId);
            }
        }
    } catch (err: any) {
        showTypingIndicator(false);
        console.error("[Chat Frontend] Submit error:", err.message);
        appendMessage({
            id: `sys_${Date.now()}`,
            sender_role: "system",
            message: t("chat.error_send", "Gagal mengirim pesan. Silakan coba lagi."),
            created_at: new Date().toISOString()
        });
    } finally {
        isSending = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
        scrollToBottom();
    }
}

/**
 * Inisialisasi awal modul Live Chat saat halaman dimuat
 */
export function initLiveChat(): void {
    // Ekspor ke window global untuk interaksi inline onclick di HTML Layout & Komponen
    (window as any).openLiveChatModal = openLiveChatModal;
    (window as any).closeLiveChatModal = closeLiveChatModal;
    (window as any).sendQuickChatMessage = sendQuickChatMessage;
    (window as any).requestHumanAdmin = requestHumanAdmin;
    (window as any).handleLiveChatSubmit = handleLiveChatSubmit;
    (window as any).clearChatProductContext = clearChatProductContext;
    (window as any).setChatOrderContext = setChatOrderContext;
    (window as any).clearChatOrderContext = clearChatOrderContext;
    (window as any).handleChatThreadChange = handleChatThreadChange;
    (window as any).saveChatOrder = saveRecentOrder;
    (window as any).getRecentOrders = getRecentOrders;
    (window as any).renderThreadSelector = renderThreadSelector;
    (window as any).appendMessage = appendMessage;

    // Catat ID pesan welcome yang sudah ada di markup awal Layout.astro
    renderedMessageIds.add("welcome-1");
    renderedMessageIds.add("welcome-2");

    // Pasang handler form tepat SATU KALI dengan penanda dataset.bound mutlak
    const form = document.getElementById("livechat-form") as HTMLFormElement | null;
    if (form && form.dataset.bound !== "true") {
        form.dataset.bound = "true";
        form.onsubmit = (e) => {
            e.preventDefault();
            handleLiveChatSubmit(e);
            return false;
        };
    }

    // Pasang auto-expand textarea dan penghitung karakter
    const input = getChatInput() as HTMLTextAreaElement | null;
    if (input && (input as any).dataset.boundInput !== "true") {
        (input as any).dataset.boundInput = "true";
        input.addEventListener("input", () => {
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 112) + "px";

            const counter = document.getElementById("chat-char-counter");
            if (counter) {
                const len = input.value.length;
                counter.innerText = `${len} / 400`;
                if (len >= 400) {
                    counter.className = "text-red-400 font-bold tabular-nums";
                } else if (len >= 350) {
                    counter.className = "text-amber-400 font-semibold tabular-nums";
                } else {
                    counter.className = "text-[#64748B] tabular-nums";
                }
            }
        });

        input.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleLiveChatSubmit();
            }
        });
    }

    const headerChatBtn = document.getElementById("header-chat-btn");
    if (headerChatBtn) {
        headerChatBtn.onclick = (e) => {
            e.preventDefault();
            openLiveChatModal();
        };
    }

    const chatModal = document.getElementById("global-livechat-modal");
    if (chatModal) {
        chatModal.addEventListener("click", (e) => {
            if (e.target === chatModal) closeLiveChatModal();
        });
    }

    // Dengarkan event perubahan bahasa agar header chat dan UI teks sinkron
    document.addEventListener("yasui-lang-change", () => {
        updateChatHeaderUI(currentSessionMode);
        updateContextBarUI();
    });

    // Jaga agar modal TIDAK PERNAH terbuka sendiri saat page load
    closeLiveChatModal();
}

// Global attachment on initial module load
if (typeof window !== "undefined") {
    (window as any).openLiveChatModal = openLiveChatModal;
    (window as any).closeLiveChatModal = closeLiveChatModal;
    (window as any).sendQuickChatMessage = sendQuickChatMessage;
    (window as any).requestHumanAdmin = requestHumanAdmin;
    (window as any).handleLiveChatSubmit = handleLiveChatSubmit;
    (window as any).clearChatProductContext = clearChatProductContext;
    (window as any).setChatOrderContext = setChatOrderContext;
    (window as any).clearChatOrderContext = clearChatOrderContext;
    (window as any).handleChatThreadChange = handleChatThreadChange;
    (window as any).saveChatOrder = saveRecentOrder;
    (window as any).getRecentOrders = getRecentOrders;
    (window as any).renderThreadSelector = renderThreadSelector;
}
