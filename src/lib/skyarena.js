/**
 * Sky Arena Station — API Client
 * Reverse-engineered dari https://visual.skyarenastation.com
 * Lihat dokumentasi: scratch/SKYARENA-API.md
 *
 * Auth: POST /api/login {email,password} -> JWT bearer (~24 jam)
 */

export const BASE_URL = (process.env.SKYARENA_BASE_URL || "https://visual.skyarenastation.com").replace(/\/+$/, "");
const ADMIN_PREFIX = "/api/rtsctans";

let cachedToken = null;
let tokenExpiry = 0; // epoch ms

function decodeJwtExpiry(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
        return payload.exp ? payload.exp * 1000 : Date.now() + 23 * 3600 * 1000;
    } catch {
        return Date.now() + 23 * 3600 * 1000;
    }
}

export async function login(force = false) {
    if (!force && cachedToken && Date.now() < tokenExpiry - 60_000) {
        return cachedToken;
    }
    const email = process.env.SKYARENA_EMAIL;
    const password = process.env.SKYARENA_PASSWORD;
    if (!email || !password) throw new Error("SKYARENA_EMAIL / SKYARENA_PASSWORD belum di-set di .env");

    const res = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`SkyArena login gagal: HTTP ${res.status} ${await res.text().catch(() => "")}`);
    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiry = decodeJwtExpiry(cachedToken);
    return cachedToken;
}

async function request(path, { method = "GET", body = null, retry = true } = {}) {
    const token = await login();
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401 && retry) {
        await login(true);
        return request(path, { method, body, retry: false });
    }
    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`SkyArena ${method} ${path} -> HTTP ${res.status}: ${txt.slice(0, 300)}`);
    }
    return res.json();
}

const get = (p) => request(p);
const post = (p, body) => request(p, { method: "POST", body });

/* ================= MONSTERS ================= */
export async function getMonsterNames() {
    const d = await get("/api/monster-names");
    return d.monsters || [];
}

/** Monster Light & Dark natural-5 saja (untuk produk Yasui). */
export async function getLdNat5Monsters() {
    const all = await getMonsterNames();
    return all.filter((m) => (m.element === "Light" || m.element === "Dark") && m.naturalStars === 5);
}

/* ================= STOCK / ACCOUNTS ================= */
export const REGIONS = ["ASIA", "GLOBAL", "EUROPA"];

/** Kategori akun SkyArena. */
export const ACCOUNT_TYPES = {
    blessing: { list: "/api/accounts/blessing/list", meta: "/api/accounts/blessing/meta", sse: "/api/accounts/blessing/sse" },
    old: { list: "/api/accounts/old/list", meta: "/api/accounts/old/meta", sse: "/api/accounts/old/sse" },
    scroll: { list: "/api/accounts/scroll/list", meta: "/api/accounts/scroll/meta", sse: "/api/accounts/scroll/sse" },
};

export async function getScrollMeta() {
    return get("/api/accounts/scroll/meta"); // {total, freeTotal, byRegion, googleCount, guestCount}
}

/** Meta per kategori. blessing meta punya day1Count & lastHourCount. */
export async function getAccountMeta(type = "blessing") {
    const t = ACCOUNT_TYPES[type];
    if (!t) throw new Error(`Tipe akun tidak dikenal: ${type}`);
    return get(t.meta);
}

/** Daftar akun per kategori (blessing|old|scroll). */
export async function getAccounts(type, { region = "ASIA", offset = 0, limit = 30, unitMasterIds = null, sortBy = null } = {}) {
    const t = ACCOUNT_TYPES[type];
    if (!t) throw new Error(`Tipe akun tidak dikenal: ${type}`);
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (region && region !== "all") params.set("region", region);
    if (unitMasterIds && unitMasterIds.length) params.set("unitMasterIds", unitMasterIds.join(","));
    if (sortBy) params.set("sortBy", sortBy);
    return get(`${t.list}?${params.toString()}`); // {accounts, total, offset, limit}
}

/** Ambil SEMUA akun untuk kategori+region (paging paralel). */
export async function getAllAccounts(type, { region = "ASIA", pageSize = 100, concurrency = 8 } = {}) {
    const first = await getAccounts(type, { region, offset: 0, limit: pageSize });
    const total = first.total || (first.accounts || []).length;
    const out = [...(first.accounts || [])];
    const pages = Math.ceil(total / pageSize);
    for (let start = 1; start < pages; start += concurrency) {
        const batch = [];
        for (let p = start; p < Math.min(start + concurrency, pages); p++) {
            batch.push(getAccounts(type, { region, offset: p * pageSize, limit: pageSize }).catch(() => ({ accounts: [] })));
        }
        const results = await Promise.all(batch);
        for (const r of results) out.push(...(r.accounts || []));
    }
    return out.slice(0, total);
}

/** Cek stok akun yang mengandung monster tertentu, per kategori+region. */
export async function countAccountsWithMonster({ region, unitMasterId, type = "blessing" }) {
    const d = await getAccounts(type, { region, offset: 0, limit: 1, unitMasterIds: [unitMasterId] });
    return d.total || 0;
}

export async function getScrollVariants() {
    const d = await get("/api/accounts/scroll/variants");
    return d.variants || [];
}

/* ---- Alias kompatibilitas (scroll) ---- */
export const getScrollAccounts = (opts) => getAccounts("scroll", opts);
export const getAllScrollAccounts = (opts) => getAllAccounts("scroll", opts);

/* ================= SSE (real-time) ================= */
/**
 * Dengarkan SSE stok scroll. onEvent(obj) dipanggil tiap event.
 * Mengembalikan fungsi close(). Auto-reconnect sederhana.
 */
export function listenScrollSse(onEvent, { onError = () => {} } = {}) {
    let aborted = false;
    let abortCtrl = null;

    async function connect() {
        while (!aborted) {
            try {
                const token = await login();
                abortCtrl = new AbortController();
                const res = await fetch(`${BASE_URL}/api/accounts/scroll/sse`, {
                    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
                    signal: abortCtrl.signal,
                });
                if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buf = "";
                while (!aborted) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                    const parts = buf.split("\n\n");
                    buf = parts.pop();
                    for (const part of parts) {
                        const line = part.split("\n").find((l) => l.startsWith("data:"));
                        if (!line) continue;
                        try { onEvent(JSON.parse(line.slice(5).trim())); } catch {}
                    }
                }
            } catch (e) {
                if (!aborted) onError(e);
            }
            if (!aborted) await new Promise((r) => setTimeout(r, 3000)); // backoff reconnect
        }
    }
    connect();
    return () => { aborted = true; if (abortCtrl) abortCtrl.abort(); };
}

/* ================= SET-ACCOUNT (fulfillment) ================= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kunci akun agar tidak diserobot reseller lain. */
export async function buyLock(uid, body = {}) {
    return post(`${ADMIN_PREFIX}/accounts/${uid}/buy/lock`, body);
}
/** Lepas lock akun (batal). */
export async function buyUnlock(uid) {
    return request(`${ADMIN_PREFIX}/accounts/${uid}/buy/lock`, { method: "DELETE" });
}
/** Status lock akun. */
export async function buyStatus(uid) {
    return get(`${ADMIN_PREFIX}/accounts/${uid}/buy/status`);
}
/**
 * Catat penjualan. Body: {buyerName, platform, price, currency, isPaid, saleId?}
 * price = HARGA MODAL (setoran). platform = "Yasui Game" (teks custom diterima).
 */
export async function buySale(uid, { buyerName, platform, price, currency = "USD", isPaid = true, saleId = null } = {}) {
    const body = { buyerName, platform, price, currency, isPaid };
    if (saleId) body.saleId = saleId;
    return request(`${ADMIN_PREFIX}/accounts/${uid}/buy/sale`, { method: "PUT", body });
}
/** Tandai akun terjual final. 409 = sudah, diabaikan caller. */
export async function buyComplete(uid, saleId) {
    const q = saleId ? `?saleId=${saleId}` : "";
    return post(`${ADMIN_PREFIX}/accounts/${uid}/buy/complete${q}`);
}

export async function rebuyInfo(jobId) {
    return get(`${ADMIN_PREFIX}/set-account/jobs/${jobId}/rebuy-info`); // {canBuy, reason, uid, saleId, accountType}
}

export async function getBuyLocks() {
    const d = await get(`${ADMIN_PREFIX}/set-account/buy-locks`);
    return d.buyLocks || [];
}

/** Mulai job set-account untuk sebuah akun (uid) + saleId. -> {jobId} */
export async function startSetAccount(uid, saleId) {
    return post(`${ADMIN_PREFIX}/accounts/${uid}/set-account/start`, saleId ? { saleId } : {});
}

/** Submit kredensial Hive pembeli. */
export async function submitHiveCredentials(jobId, { hiveUsername, hivePassword, saleId }) {
    return post(`${ADMIN_PREFIX}/set-account/jobs/${jobId}/hive`, { hiveUsername, hivePassword, ...(saleId ? { saleId } : {}) });
}

/** Status job set-account. -> {jobStatus: awaiting_hive|completed|failed|cancelled, jobSuggestedHiveUsername} */
export async function getSetAccountJobStatus(saleId) {
    return get(`${ADMIN_PREFIX}/sales-history/${saleId}/set-account/job-status`);
}
