import { Buffer } from "node:buffer";
import crypto from "node:crypto";

// Auto load .env if running in Node standalone
if (typeof process !== "undefined" && typeof process.loadEnvFile === "function") {
    try {
        process.loadEnvFile();
    } catch (e) {
        // .env might not exist or already loaded
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
 * Universal WooCommerce REST API Fetcher
 * @param {string} endpoint - e.g. 'products', 'orders', 'products/categories'
 * @param {object} options - fetch options: method, params, body
 */
export async function wcFetch(endpoint, { method = "GET", params = {}, body = null } = {}) {
    const cleanUrl = WP_URL.replace(/\/+$/, "");
    const url = new URL(`${cleanUrl}/wp-json/wc/v3/${endpoint.replace(/^\/+/, "")}`);

    // Append search params
    Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
            url.searchParams.append(key, String(val));
        }
    });

    // Cache-buster untuk GET: hindari object-cache WP yang menyimpan response lama per URL
    if (method === "GET") {
        url.searchParams.append("_", Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
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
    };

    const fetchOptions = {
        method,
        headers,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

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
            console.error(`WooCommerce API Error [${response.status} ${response.statusText}] at ${endpoint}:`, parsedError);
            throw new Error(parsedError.message || `WooCommerce API Error ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Network / Execution Error in wcFetch(${endpoint}):`, error);
        throw error;
    }
}

// --- HELPER WRAPPERS ---

/**
 * Ambil daftar produk
 * @param {object} params - { per_page, page, category, search, orderby, order, slug, featured }
 */
export async function getProducts(params = { per_page: 20 }) {
    return wcFetch("products", { params });
}

/**
 * Ambil single produk berdasarkan slug atau ID
 */
export async function getProductBySlug(slug) {
    const products = await wcFetch("products", { params: { slug, per_page: 1 } });
    return products && products.length > 0 ? products[0] : null;
}

export async function getProductById(id) {
    return wcFetch(`products/${id}`);
}

/**
 * Ambil daftar kategori produk
 */
export async function getCategories(params = { per_page: 50, hide_empty: false }) {
    return wcFetch("products/categories", { params });
}

export async function getCategoryBySlug(slug) {
    const cats = await wcFetch("products/categories", { params: { slug, per_page: 1 } });
    return cats && cats.length > 0 ? cats[0] : null;
}

export async function getCategoryById(id) {
    return wcFetch(`products/categories/${id}`);
}

/**
 * Buat order baru
 */
export async function createOrder(orderData) {
    return wcFetch("orders", { method: "POST", body: orderData });
}

export async function getOrder(orderId) {
    return wcFetch(`orders/${orderId}`);
}

/**
 * Update status/metadata order WooCommerce
 */
export async function updateOrder(orderId, updateData) {
    return wcFetch(`orders/${orderId}`, { method: "PUT", body: updateData });
}

/**
 * Cari atau buat customer berdasarkan email
 * Mencegah bug multiple akun:
 * 1. Selalu mencari dengan role: 'all' agar akun lama (customer/admin/dsb) terdeteksi.
 * 2. Jika email sudah ada, langsung kembalikan akun tersebut tanpa membuat baru.
 * 3. Jika terjadi race condition (email-exists), fallback otomatis mengambil akun yang ada.
 */
export async function findOrCreateCustomer({ email, firstName = "Customer", phone = "", username = "" }) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();

    try {
        // 1. Cek apakah customer sudah ada (gunakan role: 'all' agar mencakup role apa pun)
        const existing = await wcFetch("customers", { 
            params: { 
                email: cleanEmail, 
                role: "all", 
                per_page: 1 
            } 
        });

        if (existing && existing.length > 0) {
            console.log(`[Customer Match] Email ${cleanEmail} sudah terdaftar dengan ID ${existing[0].id}. Menautkan order.`);
            return existing[0];
        }

        // 2. Jika belum ada, buat customer baru
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
                }
            });
            console.log(`[Customer Created] Akun baru berhasil dibuat untuk ${cleanEmail} (ID: ${newCustomer.id})`);
            return newCustomer;
        } catch (createErr) {
            // 3. Fallback jika email ternyata baru saja terdaftar / race condition
            const msg = String(createErr.message || "").toLowerCase();
            if (msg.includes("email-exists") || msg.includes("already registered") || msg.includes("existing_user_email")) {
                console.log(`[Customer Exists Fallback] Email ${cleanEmail} sudah ada di database. Mengambil user ID.`);
                const retryExisting = await wcFetch("customers", { 
                    params: { 
                        email: cleanEmail, 
                        role: "all", 
                        per_page: 1 
                    } 
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
    return wcFetch("products/reviews", { method: "POST", body: reviewData });
}

/**
 * Update Customer Password di WooCommerce
 */
export async function updateCustomerPassword(customerId, newPassword) {
    return wcFetch(`customers/${customerId}`, {
        method: "PUT",
        body: { password: newPassword }
    });
}

/**
 * Autentikasi Customer via WordPress
 * Memeriksa kecocokan email/username dan kata sandi langsung ke WordPress engine
 */
export async function authenticateCustomer(emailOrUsername, password) {
    try {
        const cleanUrl = WP_URL.replace(/\/+$/, "");
        const params = new URLSearchParams();
        params.append("log", emailOrUsername);
        params.append("pwd", password);
        params.append("wp-submit", "Log In");

        const response = await fetch(`${cleanUrl}/wp-login.php`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Yasui-Frontend-Auth/1.0"
            },
            body: params.toString(),
            redirect: "manual"
        });

        const location = response.headers.get("location") || "";
        const setCookie = response.headers.get("set-cookie") || "";

        // Gagal jika diarahkan kembali ke wp-login.php dengan error
        if (location.includes("login_error") || location.includes("redirect_to") && response.status !== 302) {
            return false;
        }

        // Sukses jika ada cookie wordpress_logged_in atau redirect 302 ke dashboard/beranda
        const hasLoginCookie = setCookie.includes("wordpress_logged_in");
        const isRedirectedAway = response.status === 302 && !location.includes("wp-login.php");

        return hasLoginCookie || isRedirectedAway;
    } catch (e) {
        console.error("Auth verification error:", e);
        return false;
    }
}

/**
 * Buat Signed Session Token HMAC-SHA256 untuk Sesi Pelanggan (30 Hari)
 */
export function generateSessionToken(email) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 hari
    const secret = WC_CONSUMER_SECRET || "yasui-secret-cyberpunk-key-2026";
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
        const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf-8"));
        if (!decoded || !decoded.email || !decoded.expiresAt || !decoded.signature) return false;
        if (Number(decoded.expiresAt) < Date.now()) return false;
        if (expectedEmail && decoded.email.toLowerCase() !== expectedEmail.trim().toLowerCase()) return false;

        const secret = WC_CONSUMER_SECRET || "yasui-secret-cyberpunk-key-2026";
        const payload = `${decoded.email}:${decoded.expiresAt}`;
        const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

        if (decoded.signature.length !== expectedSignature.length) return false;
        return crypto.timingSafeEqual(Buffer.from(decoded.signature), Buffer.from(expectedSignature));
    } catch (e) {
        return false;
    }
}

export async function getBanners() {
    try {
        const cleanUrl = WP_URL.replace(/\/+$/, "");
        const res = await fetch(`${cleanUrl}/wp-json/wp/v2/posts?per_page=5&_embed=1`);
        if (!res.ok) return [];
        const posts = await res.json();
        
        // Filter banner posts and format
        return posts
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
    } catch (e) {
        console.warn("Failed to fetch banners:", e.message);
        return [];
    }
}
