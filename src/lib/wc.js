import { Buffer } from "node:buffer";
import crypto from "node:crypto";

// Guard: Modul ini hanya boleh dijalankan di server-side (Node.js / SSR Astro)
if (import.meta.env && import.meta.env.SSR === false) {
    throw new Error("Security Violation: WooCommerce API module can only be imported in server-side context.");
}

// Auto load .env if running in Node standalone
if (typeof process !== "undefined" && typeof process.loadEnvFile === "function") {
    try {
        process.loadEnvFile();
    } catch (e) {
        // .env already loaded or missing
    }
}

const getEnv = (key, fallback = "") => {
    try {
        if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
            return import.meta.env[key];
        }
    } catch (e) {}
    if (typeof process !== "undefined" && process.env && process.env[key]) {
        return process.env[key];
    }
    return fallback;
};

export const WP_URL = getEnv("WP_URL", "https://admin.yasuigame.com");
const WC_CONSUMER_KEY = getEnv("WC_CONSUMER_KEY");
const WC_CONSUMER_SECRET = getEnv("WC_CONSUMER_SECRET");

/**
 * Validasi kredensial WooCommerce (Fail-Fast)
 */
function assertWcCredentials() {
    if (!WC_CONSUMER_KEY || !WC_CONSUMER_SECRET) {
        throw new Error("Configuration Error: WC_CONSUMER_KEY dan WC_CONSUMER_SECRET wajib dikonfigurasi di environment server.");
    }
}

// ==============================================================================
// IN-MEMORY SHORT TTL CACHE (Melindungi koneksi database MySQL Hostinger)
// ==============================================================================
const cacheStore = new Map();
const DEFAULT_CACHE_TTL = 45 * 1000; // 45 Detik TTL untuk katalog publik

function getCacheKey(endpoint, params = {}) {
    const sortedParams = Object.keys(params)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join("&");
    return `${endpoint}?${sortedParams}`;
}

function getFromCache(key) {
    const entry = cacheStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        cacheStore.delete(key);
        return null;
    }
    return entry.data;
}

function setToCache(key, data, ttlMs = DEFAULT_CACHE_TTL) {
    // Batasi ukuran cache maksimal 200 entri untuk mencegah memory leak
    if (cacheStore.size > 200) {
        const oldestKey = cacheStore.keys().next().value;
        if (oldestKey) cacheStore.delete(oldestKey);
    }
    cacheStore.set(key, {
        data,
        expiry: Date.now() + ttlMs
    });
}

/**
 * Bersihkan seluruh atau sebagian in-memory cache
 */
export function clearWcCache(prefix = "") {
    if (!prefix) {
        cacheStore.clear();
        return;
    }
    for (const key of cacheStore.keys()) {
        if (key.startsWith(prefix)) {
            cacheStore.delete(key);
        }
    }
}

// ==============================================================================
// UNIVERSAL WOOCOMMERCE REST API FETCHER (TIMEOUT, RETRY & ERROR SANITIZATION)
// ==============================================================================
/**
 * Universal WooCommerce REST API Fetcher
 * @param {string} endpoint - e.g. 'products', 'orders', 'products/categories'
 * @param {object} options - { method, params, body, bypassCache, ttlMs, retries }
 */
export async function wcFetch(endpoint, {
    method = "GET",
    params = {},
    body = null,
    bypassCache = false,
    ttlMs = DEFAULT_CACHE_TTL,
    retries = 1
} = {}) {
    assertWcCredentials();

    const isGet = method.toUpperCase() === "GET";
    const cacheKey = isGet ? getCacheKey(endpoint, params) : null;

    // 1. Cek In-Memory Cache untuk GET request jika bypassCache tidak aktif
    if (isGet && !bypassCache && cacheKey) {
        const cached = getFromCache(cacheKey);
        if (cached !== null) {
            return cached;
        }
    }

    const cleanUrl = WP_URL.replace(/\/+$/, "");
    const cleanEndpoint = endpoint.replace(/^\/+/, "");
    const url = new URL(`${cleanUrl}/wp-json/wc/v3/${cleanEndpoint}`);

    // Append search params
    Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
            url.searchParams.append(key, String(val));
        }
    });

    // Hanya jika eksplisit bypassCache pada GET: tambahkan bust query
    if (isGet && bypassCache) {
        url.searchParams.append("_bust", Date.now().toString(36));
    }

    // Basic Auth with Consumer Key & Secret
    const authString = `${WC_CONSUMER_KEY}:${WC_CONSUMER_SECRET}`;
    const authHeader = typeof Buffer !== "undefined"
        ? Buffer.from(authString).toString("base64")
        : btoa(authString);

    const headers = {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "YasuiGame-AstroSSR/2.0"
    };

    const fetchOptions = {
        method,
        headers,
        signal: AbortSignal.timeout(8000) // Timeout tegas 8 detik agar SSR tidak menggantung
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    let attempt = 0;
    while (attempt <= retries) {
        attempt++;
        try {
            const response = await fetch(url.toString(), fetchOptions);

            if (!response.ok) {
                const errorText = await response.text();
                let parsedError = null;
                try {
                    parsedError = JSON.parse(errorText);
                } catch (e) {
                    parsedError = { message: errorText };
                }

                // Log internal (tanpa membocorkan kredensial auth)
                console.error(`[WooCommerce REST ${response.status}] ${method} ${cleanEndpoint}:`, {
                    status: response.status,
                    code: parsedError.code || "unknown",
                    message: parsedError.message || "Unknown error"
                });

                // Cek apakah server Hostinger overload (502, 503, 504) dan masih bisa retry
                if ([502, 503, 504].includes(response.status) && attempt <= retries) {
                    await new Promise(r => setTimeout(r, 400));
                    continue;
                }

                // Error tersanitasi untuk dilempar ke caller
                const safeMessage = (parsedError && parsedError.message && !parsedError.message.includes("max_user_connections") && !parsedError.message.includes("SQLSTATE"))
                    ? parsedError.message
                    : `Layanan katalog sedang sibuk (${response.status}). Silakan coba beberapa saat lagi.`;

                throw new Error(safeMessage);
            }

            const data = await response.json();

            // Simpan ke in-memory cache jika GET dan berhasil
            if (isGet && !bypassCache && cacheKey) {
                setToCache(cacheKey, data, ttlMs);
            }

            // Jika ada mutasi data yang mengubah produk atau kategori, invalidasi cache terkait
            if (!isGet) {
                if (cleanEndpoint.startsWith("orders")) {
                    clearWcCache("orders");
                } else if (cleanEndpoint.startsWith("products")) {
                    clearWcCache("products");
                }
            }

            return data;

        } catch (error) {
            const isTimeout = error.name === "TimeoutError";
            const isNetworkError = error.message?.includes("fetch failed") || error.code === "ECONNRESET";

            if ((isTimeout || isNetworkError) && attempt <= retries) {
                console.warn(`[Retry ${attempt}/${retries}] Retrying ${method} ${cleanEndpoint} due to ${error.name || error.message}`);
                await new Promise(r => setTimeout(r, 400));
                continue;
            }

            if (isTimeout) {
                console.error(`[WooCommerce Timeout 8s] ${method} ${cleanEndpoint}`);
                throw new Error("Koneksi ke server database katalog mengalami timeout. Silakan coba kembali beberapa saat lagi.");
            }

            console.error(`[WooCommerce Network Error] at ${cleanEndpoint}:`, error.message);
            throw new Error(error.message || "Gagal menghubungi backend katalog toko.");
        }
    }
}

// ==============================================================================
// HELPER WRAPPERS
// ==============================================================================

/**
 * Ambil daftar produk (Cached 45 detik)
 */
export async function getProducts(params = { per_page: 20 }, { bypassCache = false } = {}) {
    return wcFetch("products", { params, bypassCache });
}

/**
 * Ambil single produk berdasarkan slug (Cached 45 detik)
 */
export async function getProductBySlug(slug, { bypassCache = false } = {}) {
    const products = await wcFetch("products", {
        params: { slug, per_page: 1 },
        bypassCache
    });
    return products && products.length > 0 ? products[0] : null;
}

/**
 * Ambil single produk berdasarkan ID
 */
export async function getProductById(id, { bypassCache = false } = {}) {
    return wcFetch(`products/${parseInt(id, 10)}`, { bypassCache });
}

/**
 * Ambil daftar kategori produk (Cached 60 detik)
 */
export async function getCategories(params = { per_page: 50, hide_empty: false }, { bypassCache = false } = {}) {
    return wcFetch("products/categories", { params, bypassCache, ttlMs: 60 * 1000 });
}

export async function getCategoryBySlug(slug, { bypassCache = false } = {}) {
    const cats = await wcFetch("products/categories", {
        params: { slug, per_page: 1 },
        bypassCache,
        ttlMs: 60 * 1000
    });
    return cats && cats.length > 0 ? cats[0] : null;
}

export async function getCategoryById(id, { bypassCache = false } = {}) {
    return wcFetch(`products/categories/${parseInt(id, 10)}`, { bypassCache, ttlMs: 60 * 1000 });
}

/**
 * Buat order baru (Bypass Cache Mutlak)
 */
export async function createOrder(orderData) {
    return wcFetch("orders", { method: "POST", body: orderData, bypassCache: true });
}

/**
 * Ambil detail pesanan (Bypass Cache secara default agar status real-time)
 */
export async function getOrder(orderId, { bypassCache = true } = {}) {
    return wcFetch(`orders/${parseInt(orderId, 10)}`, { bypassCache });
}

/**
 * Update status/metadata order WooCommerce (Bypass Cache)
 */
export async function updateOrder(orderId, updateData) {
    return wcFetch(`orders/${parseInt(orderId, 10)}`, {
        method: "PUT",
        body: updateData,
        bypassCache: true
    });
}

/**
 * Cari atau buat customer berdasarkan email
 */
export async function findOrCreateCustomer({ email, firstName = "Customer", phone = "", username = "" }) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();

    try {
        // Cek apakah customer sudah ada
        const existing = await wcFetch("customers", { 
            params: { 
                email: cleanEmail, 
                role: "all", 
                per_page: 1 
            },
            bypassCache: true
        });

        if (existing && existing.length > 0) {
            return existing[0];
        }

        // Jika belum ada, buat customer baru
        const cleanUsername = username 
            ? username.trim() 
            : cleanEmail.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") + "_" + Math.floor(1000 + Math.random() * 9000);

        try {
            const newCustomer = await wcFetch("customers", {
                method: "POST",
                body: {
                    email: cleanEmail,
                    first_name: firstName,
                    username: cleanUsername,
                    billing: {
                        email: cleanEmail,
                        first_name: firstName,
                        phone,
                    }
                },
                bypassCache: true
            });
            return newCustomer;
        } catch (createErr) {
            // Fallback jika race condition
            const msg = String(createErr.message || "").toLowerCase();
            if (msg.includes("email-exists") || msg.includes("already registered") || msg.includes("existing_user_email")) {
                const retryExisting = await wcFetch("customers", { 
                    params: { 
                        email: cleanEmail, 
                        role: "all", 
                        per_page: 1 
                    },
                    bypassCache: true
                });
                if (retryExisting && retryExisting.length > 0) {
                    return retryExisting[0];
                }
            }
            throw createErr;
        }
    } catch (err) {
        console.warn("Gagal membuat/mencari customer di WooCommerce (lanjut sebagai guest):", err.message);
        return null;
    }
}

/**
 * Normalize WooCommerce REST product to unified format
 */
export function normalizeProduct(p) {
    if (!p) return null;
    const mainImg = p.images?.[0]?.src || null;
    const formattedPrice = p.price ? `Rp ${Number(p.price).toLocaleString("id-ID")}` : "Rp 0";
    const formattedRegular = p.regular_price ? `Rp ${Number(p.regular_price).toLocaleString("id-ID")}` : "";

    return {
        ...p,
        id: p.id,
        databaseId: p.id,
        name: p.name,
        slug: p.slug,
        shortDescription: p.short_description || "",
        description: p.description || "",
        price: formattedPrice,
        rawPrice: p.price || "0",
        regularPrice: formattedRegular,
        rawRegularPrice: p.regular_price || "",
        stockStatus: p.stock_status === "instock" ? "IN_STOCK" : "OUT_OF_STOCK",
        image: mainImg ? { sourceUrl: mainImg } : null,
        images: p.images || [],
        galleryImages: {
            nodes: (p.images || []).slice(1).map(img => ({ sourceUrl: img.src }))
        },
        productCategories: {
            nodes: (p.categories || []).map(c => ({ id: c.id, name: c.name, slug: c.slug }))
        },
        categories: p.categories || [],
        attributes: {
            nodes: (p.attributes || []).map(a => ({
                id: a.id,
                name: a.name,
                options: a.options || []
            }))
        }
    };
}

/**
 * Reviews
 */
export async function getReviews(params = { per_page: 20 }) {
    return wcFetch("products/reviews", { params });
}

export async function createReview(reviewData) {
    return wcFetch("products/reviews", { method: "POST", body: reviewData, bypassCache: true });
}

/**
 * Update Customer Password di WooCommerce (Validasi input ketat)
 */
export async function updateCustomerPassword(customerId, newPassword) {
    const cleanId = parseInt(customerId, 10);
    if (!cleanId || isNaN(cleanId) || cleanId <= 0) {
        throw new Error("Customer ID tidak valid.");
    }
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6 || newPassword.length > 128) {
        throw new Error("Kata sandi baru harus berukuran antara 6 hingga 128 karakter.");
    }
    return wcFetch(`customers/${cleanId}`, {
        method: "PUT",
        body: { password: newPassword },
        bypassCache: true
    });
}

/**
 * Autentikasi Customer via WordPress Engine
 */
export async function authenticateCustomer(emailOrUsername, password) {
    if (!emailOrUsername || !password) return false;
    try {
        const cleanUrl = WP_URL.replace(/\/+$/, "");
        const params = new URLSearchParams();
        params.append("log", emailOrUsername.trim());
        params.append("pwd", password);
        params.append("wp-submit", "Log In");

        const response = await fetch(`${cleanUrl}/wp-login.php`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Yasui-Frontend-Auth/2.0"
            },
            body: params.toString(),
            redirect: "manual",
            signal: AbortSignal.timeout(8000)
        });

        const location = response.headers.get("location") || "";
        const setCookie = response.headers.get("set-cookie") || "";

        // Gagal jika diarahkan kembali ke wp-login.php dengan error
        if (location.includes("login_error") || (location.includes("redirect_to") && response.status !== 302)) {
            return false;
        }

        // Sukses jika ada cookie wordpress_logged_in atau redirect 302 ke dashboard/beranda
        const hasLoginCookie = setCookie.includes("wordpress_logged_in");
        const isRedirectedAway = response.status === 302 && !location.includes("wp-login.php");

        return hasLoginCookie || isRedirectedAway;
    } catch (e) {
        console.error("Auth verification error:", e.message);
        return false;
    }
}

/**
 * Buat Signed Session Token HMAC-SHA256 untuk Sesi Pelanggan (30 Hari)
 * Zero-Trust: Gagal jika WC_CONSUMER_SECRET tidak tersedia (tidak ada fallback hardcoded)
 */
export function generateSessionToken(email) {
    assertWcCredentials();
    const cleanEmail = (email || "").trim().toLowerCase();
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 hari
    const secret = WC_CONSUMER_SECRET;
    const payload = `${cleanEmail}:${expiresAt}`;
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const token = Buffer.from(JSON.stringify({ email: cleanEmail, expiresAt, signature })).toString("base64url");
    return { token, expiresAt };
}

/**
 * Verifikasi Keabsahan Session Token
 */
export function verifySessionToken(token, expectedEmail = null) {
    if (!token || typeof token !== "string") return false;
    try {
        assertWcCredentials();
        const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf-8"));
        if (!decoded || !decoded.email || !decoded.expiresAt || !decoded.signature) return false;
        if (Number(decoded.expiresAt) < Date.now()) return false;
        if (expectedEmail && decoded.email.toLowerCase() !== expectedEmail.trim().toLowerCase()) return false;

        const secret = WC_CONSUMER_SECRET;
        const payload = `${decoded.email}:${decoded.expiresAt}`;
        const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

        if (decoded.signature.length !== expectedSignature.length) return false;
        return crypto.timingSafeEqual(Buffer.from(decoded.signature), Buffer.from(expectedSignature));
    } catch (e) {
        return false;
    }
}

/**
 * Ambil banner beranda WordPress (Cached 60 detik)
 */
export async function getBanners() {
    const cacheKey = "wp:banners";
    const cached = getFromCache(cacheKey);
    if (cached) return cached;

    const fallbackBanners = [
        {
            title: "Main Banner",
            link: "#",
            featuredImage: {
                node: {
                    sourceUrl: "https://admin.yasuigame.com/wp-content/uploads/2026/01/Gaming-Global-Market-scaled.png",
                    altText: "Yasui Game - Global Market"
                }
            }
        },
        {
            title: "Right Up",
            link: "#",
            featuredImage: {
                node: {
                    sourceUrl: "https://admin.yasuigame.com/wp-content/uploads/2026/01/right-up-scaled.png",
                    altText: "Right Up"
                }
            }
        },
        {
            title: "Right Down",
            link: "#",
            featuredImage: {
                node: {
                    sourceUrl: "https://admin.yasuigame.com/wp-content/uploads/2026/01/right-down-scaled.png",
                    altText: "Right Down"
                }
            }
        }
    ];

    try {
        const cleanUrl = WP_URL.replace(/\/+$/, "");
        const res = await fetch(`${cleanUrl}/wp-json/wp/v2/posts?per_page=5&_embed=1`, {
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) {
            setToCache(cacheKey, fallbackBanners, 30 * 1000);
            return fallbackBanners;
        }
        const posts = await res.json();
        
        const banners = posts
            .filter(p => p.class_list?.includes("category-banner-home") || p.categories?.includes(46))
            .map(p => {
                const media = p._embedded?.["wp:featuredmedia"]?.[0];
                return {
                    title: p.title?.rendered || "",
                    link: p.link || "#",
                    featuredImage: media ? {
                        node: {
                            sourceUrl: media.source_url || media.media_details?.sizes?.full?.source_url || "",
                            altText: media.alt_text || p.title?.rendered || ""
                        }
                    } : null
                };
            });

        const finalBanners = banners.length > 0 ? banners : fallbackBanners;
        setToCache(cacheKey, finalBanners, 60 * 1000);
        return finalBanners;
    } catch (e) {
        console.warn("Failed to fetch banners, using official fallback:", e.message);
        setToCache(cacheKey, fallbackBanners, 30 * 1000);
        return fallbackBanners;
    }
}
