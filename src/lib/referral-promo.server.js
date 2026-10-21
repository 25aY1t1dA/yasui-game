import { supabaseAdmin, isSupabaseConfigured } from "./supabase.server.js";
import { wcFetch } from "./wc.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Guard: Modul ini hanya boleh dijalankan di server-side context (Node.js / SSR Astro)
if (import.meta.env && import.meta.env.SSR === false) {
    throw new Error("Security Violation: Referral/Promo server module can only be imported in server-side context.");
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

// ==============================================================================
// IN-MEMORY FALLBACK STORE (Active if Supabase is offline or tables not yet created)
// ==============================================================================
const inMemoryAffiliates = new Map();
const inMemoryConversions = new Map();
const inMemoryVouchers = new Map();

// Helper ID & Code Generator
function generateRandomCode(prefix = "YASUI", length = 4) {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude 0, 1, O, I for clarity
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${result}`;
}

export function normalizePromoCode(code) {
    if (!code || typeof code !== "string") return "";
    return code.trim().replace(/^#+/, "").toUpperCase();
}

// ==============================================================================
// 1. AFFILIATE PROFILE REPOSITORY
// ==============================================================================

/**
 * Cari profil afiliasi berdasarkan referral_code (case-insensitive)
 */
export async function findAffiliateByCode(rawCode) {
    const cleanCode = normalizePromoCode(rawCode);
    if (!cleanCode) return null;

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabaseAdmin
                .from("affiliate_profiles")
                .select("*")
                .ilike("referral_code", cleanCode)
                .maybeSingle();

            if (!error && data) {
                return data;
            }
        } catch (err) {
            console.warn("[Referral] findAffiliateByCode error, falling back:", err.message);
        }
    }

    // In-memory fallback
    for (const profile of inMemoryAffiliates.values()) {
        if (profile.referral_code.toUpperCase() === cleanCode) {
            return profile;
        }
    }

    return null;
}

/**
 * Cari profil afiliasi berdasarkan user_email
 */
export async function findAffiliateByEmail(rawEmail) {
    if (!rawEmail || typeof rawEmail !== "string") return null;
    const cleanEmail = rawEmail.trim().toLowerCase();

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabaseAdmin
                .from("affiliate_profiles")
                .select("*")
                .eq("user_email", cleanEmail)
                .maybeSingle();

            if (!error && data) {
                return data;
            }
        } catch (err) {
            console.warn("[Referral] findAffiliateByEmail error, falling back:", err.message);
        }
    }

    return inMemoryAffiliates.get(cleanEmail) || null;
}

/**
 * Buat atau ambil profil afiliasi user secara otomatis
 */
export async function getOrCreateAffiliateProfile(rawEmail) {
    if (!rawEmail || typeof rawEmail !== "string") {
        throw new Error("User email is required");
    }
    const cleanEmail = rawEmail.trim().toLowerCase();

    // 1. Cek apakah sudah ada
    const existing = await findAffiliateByEmail(cleanEmail);
    if (existing) {
        return existing;
    }

    // 2. Buat profil baru
    let generatedCode = generateRandomCode("YASUI", 4);
    // Pastikan tidak tabrakan
    let existingWithCode = await findAffiliateByCode(generatedCode);
    let attempts = 0;
    while (existingWithCode && attempts < 5) {
        generatedCode = generateRandomCode("YASUI", 5);
        existingWithCode = await findAffiliateByCode(generatedCode);
        attempts++;
    }

    const newProfile = {
        user_email: cleanEmail,
        referral_code: generatedCode,
        tier: "member",
        discount_percent: 3.00,
        commission_percent: 5.00,
        total_clicks: 0,
        pending_balance_idr: 0.00,
        available_balance_idr: 0.00,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabaseAdmin
                .from("affiliate_profiles")
                .insert([newProfile])
                .select()
                .maybeSingle();

            if (!error && data) {
                return data;
            }
            console.warn("[Referral] Insert affiliate_profiles error:", error?.message);
        } catch (err) {
            console.warn("[Referral] Insert affiliate exception, using in-memory:", err.message);
        }
    }

    // In-memory fallback
    const fallbackProfile = {
        id: crypto.randomUUID ? crypto.randomUUID() : `aff_${Date.now()}`,
        ...newProfile
    };
    inMemoryAffiliates.set(cleanEmail, fallbackProfile);
    return fallbackProfile;
}

/**
 * Catat klik tautan referral (?ref=KODE)
 */
export async function recordReferralClick(rawCode) {
    const cleanCode = normalizePromoCode(rawCode);
    if (!cleanCode) return false;

    if (isSupabaseConfigured()) {
        try {
            const profile = await findAffiliateByCode(cleanCode);
            if (profile) {
                await supabaseAdmin
                    .from("affiliate_profiles")
                    .update({
                        total_clicks: (profile.total_clicks || 0) + 1,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", profile.id);
                return true;
            }
        } catch (err) {
            console.warn("[Referral] recordReferralClick error:", err.message);
        }
    }

    const inMem = await findAffiliateByCode(cleanCode);
    if (inMem) {
        inMem.total_clicks = (inMem.total_clicks || 0) + 1;
        return true;
    }

    return false;
}

// ==============================================================================
// 2. PROMO VOUCHER REPOSITORY (Internal / Point Redeem)
// ==============================================================================

export async function findVoucherByCode(rawCode) {
    const cleanCode = normalizePromoCode(rawCode);
    if (!cleanCode) return null;

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabaseAdmin
                .from("promo_vouchers")
                .select("*")
                .eq("code", cleanCode)
                .eq("is_active", true)
                .maybeSingle();

            if (!error && data) {
                return data;
            }
        } catch (err) {
            console.warn("[Promo] findVoucherByCode error:", err.message);
        }
    }

    const inMem = inMemoryVouchers.get(cleanCode);
    if (inMem && inMem.is_active) {
        return inMem;
    }

    return null;
}

// ==============================================================================
// 3. WOOCOMMERCE COUPON CHECKER
// ==============================================================================

export async function findWooCommerceCoupon(rawCode) {
    const cleanCode = normalizePromoCode(rawCode);
    if (!cleanCode) return null;

    try {
        const coupons = await wcFetch("coupons", {
            params: { code: cleanCode },
            bypassCache: true
        });

        if (Array.isArray(coupons) && coupons.length > 0) {
            const coupon = coupons[0];
            if (coupon.code && coupon.code.toUpperCase() === cleanCode) {
                return coupon;
            }
        }
    } catch (err) {
        console.warn("[Promo] findWooCommerceCoupon error:", err.message);
    }

    return null;
}

// ==============================================================================
// 4. UNIFIED VALIDATION & ANTI-FRAUD ENGINE
// ==============================================================================

/**
 * Validasi universal untuk Kupon WooCommerce, Voucher Internal, & Kode Referral
 * @param {object} param0 - { code, cartTotalIdr, buyerEmail, orderTargetDetails, buyerWa }
 */
export async function validatePromoOrReferralCode({
    code,
    cartTotalIdr = 0,
    buyerEmail = "",
    orderTargetDetails = [],
    buyerWa = ""
}) {
    const cleanCode = normalizePromoCode(code);
    const cleanEmail = (buyerEmail || "").trim().toLowerCase();
    const cleanWa = (buyerWa || "").trim().replace(/\D/g, "");
    const total = Math.max(0, Number(cartTotalIdr) || 0);

    if (!cleanCode) {
        return {
            valid: false,
            error: "empty_code",
            message: "Kode promo tidak boleh kosong."
        };
    }

    // --------------------------------------------------------------------------
    // 1. PRIORITAS 1: KUPON RESMI WOOCOMMERCE
    // --------------------------------------------------------------------------
    try {
        const wcCoupon = await findWooCommerceCoupon(cleanCode);
        if (wcCoupon) {
            // Cek Minimum & Maximum Spend
            const minSpend = Number(wcCoupon.minimum_amount) || 0;
            const maxSpend = Number(wcCoupon.maximum_amount) || 0;

            if (minSpend > 0 && total < minSpend) {
                return {
                    valid: false,
                    error: "min_spend_not_met",
                    message: `Minimal belanja untuk kupon ini adalah Rp ${minSpend.toLocaleString("id-ID")}.`
                };
            }

            if (maxSpend > 0 && total > maxSpend) {
                return {
                    valid: false,
                    error: "max_spend_exceeded",
                    message: `Maksimal belanja untuk kupon ini adalah Rp ${maxSpend.toLocaleString("id-ID")}.`
                };
            }

            // Cek Expiry Date
            if (wcCoupon.date_expires) {
                const expiry = new Date(wcCoupon.date_expires).getTime();
                if (Date.now() > expiry) {
                    return {
                        valid: false,
                        error: "expired",
                        message: "Kupon diskon resmi ini telah kedaluwarsa."
                    };
                }
            }

            // Cek Usage Limit
            if (wcCoupon.usage_limit && wcCoupon.usage_count >= wcCoupon.usage_limit) {
                return {
                    valid: false,
                    error: "usage_limit_reached",
                    message: "Batas pemakaian kupon diskon ini telah tercapai."
                };
            }

            // Hitung Potongan Diskon
            let discountAmount = 0;
            const couponVal = Number(wcCoupon.amount) || 0;

            if (wcCoupon.discount_type === "percent") {
                discountAmount = Math.round(total * (couponVal / 100));
            } else {
                // fixed_cart / fixed_product
                discountAmount = Math.min(total, Math.round(couponVal));
            }

            return {
                valid: true,
                type: "wc_coupon",
                code: wcCoupon.code.toUpperCase(),
                discountAmount,
                discountPercent: wcCoupon.discount_type === "percent" ? couponVal : 0,
                description: wcCoupon.description || "Kupon Diskon Resmi Yasui Game"
            };
        }
    } catch (e) {
        console.warn("[Promo Validate] WooCommerce coupon check exception:", e.message);
    }

    // --------------------------------------------------------------------------
    // 2. PRIORITAS 2: VOUCHER INTERNAL / REDEEM POIN (promo_vouchers)
    // --------------------------------------------------------------------------
    try {
        const voucher = await findVoucherByCode(cleanCode);
        if (voucher) {
            // Cek Expiry
            if (voucher.expires_at && new Date(voucher.expires_at).getTime() < Date.now()) {
                return {
                    valid: false,
                    error: "voucher_expired",
                    message: "Voucher belanja ini telah kedaluwarsa."
                };
            }

            // Cek Max Uses
            if (voucher.used_count >= voucher.max_uses) {
                return {
                    valid: false,
                    error: "voucher_used",
                    message: "Voucher belanja ini sudah pernah digunakan."
                };
            }

            // Cek Min Order
            const minOrder = Number(voucher.min_order_idr) || 0;
            if (minOrder > 0 && total < minOrder) {
                return {
                    valid: false,
                    error: "voucher_min_order",
                    message: `Minimal belanja untuk voucher ini adalah Rp ${minOrder.toLocaleString("id-ID")}.`
                };
            }

            let discountAmount = 0;
            const discountVal = Number(voucher.discount_value) || 0;
            if (voucher.discount_type === "percent") {
                discountAmount = Math.round(total * (discountVal / 100));
            } else {
                discountAmount = Math.min(total, Math.round(discountVal));
            }

            return {
                valid: true,
                type: "voucher",
                code: voucher.code,
                discountAmount,
                discountPercent: voucher.discount_type === "percent" ? discountVal : 0,
                description: "Voucher Belanja Toko Yasui Game"
            };
        }
    } catch (e) {
        console.warn("[Promo Validate] Voucher check exception:", e.message);
    }

    // --------------------------------------------------------------------------
    // 3. PRIORITAS 3: KODE REFERRAL / CREATOR AFFILIATE (affiliate_profiles)
    // --------------------------------------------------------------------------
    try {
        const affiliate = await findAffiliateByCode(cleanCode);
        if (affiliate) {
            const referrerEmail = (affiliate.user_email || "").trim().toLowerCase();

            // PENGAMAN 1: TOLAK SELF-REFERRAL DARI EMAIL YANG SAMA
            if (cleanEmail && referrerEmail && cleanEmail === referrerEmail) {
                return {
                    valid: false,
                    error: "self_referral_email",
                    message: "Anda tidak dapat menggunakan kode referral milik Anda sendiri."
                };
            }

            // PENGAMAN 2: TOLAK JIKA TARGET IDENTITAS ATAU NO HP SAMA DENGAN PEMILIK REFERRAL
            if (cleanEmail && referrerEmail) {
                const buyerPrefix = cleanEmail.split("@")[0].toLowerCase();
                const refPrefix = referrerEmail.split("@")[0].toLowerCase();

                // Periksa apakah order target details mengandung kesamaan identitas
                if (Array.isArray(orderTargetDetails) && orderTargetDetails.length > 0) {
                    for (const target of orderTargetDetails) {
                        const robloxUser = (target.robloxUsername || "").toLowerCase();
                        const gameUid = (target.gameUid || "").toLowerCase();
                        if (robloxUser && (robloxUser === refPrefix || robloxUser === referrerEmail)) {
                            return {
                                valid: false,
                                error: "self_referral_target",
                                message: "Anti-Fraud: Username Roblox target terdeteksi sama dengan pemilik kode referral."
                            };
                        }
                        if (gameUid && (gameUid === refPrefix || gameUid === referrerEmail)) {
                            return {
                                valid: false,
                                error: "self_referral_target",
                                message: "Anti-Fraud: Game UID target terdeteksi sama dengan pemilik kode referral."
                            };
                        }
                    }
                }
            }

            // Hitung Diskon Pembeli & Komisi Afiliasi
            const discountPct = Number(affiliate.discount_percent) || 3;
            const commissionPct = Number(affiliate.commission_percent) || 5;

            const discountAmount = Math.round(total * (discountPct / 100));
            const commissionAmount = Math.round(total * (commissionPct / 100));

            return {
                valid: true,
                type: "referral",
                code: affiliate.referral_code,
                tier: affiliate.tier || "member",
                discountPercent: discountPct,
                commissionPercent: commissionPct,
                discountAmount,
                commissionAmount,
                referrerEmail: affiliate.user_email,
                description: `Diskon Teman (${discountPct}%) via Referral / Partner`
            };
        }
    } catch (e) {
        console.warn("[Promo Validate] Affiliate check exception:", e.message);
    }

    return {
        valid: false,
        error: "not_found",
        message: "Kode promo atau referral tidak ditemukan atau sudah tidak aktif."
    };
}

// ==============================================================================
// 5. REFERRAL CONVERSIONS & BALANCE LIFECYCLE
// ==============================================================================

/**
 * Catat konversi referral ke status 'pending' dan tambahkan komisi ke pending_balance_idr
 */
export async function recordPendingReferralConversion({
    referralCode,
    referrerEmail,
    buyerEmail,
    orderId,
    orderTotalIdr = 0,
    discountAmountIdr = 0,
    commissionAmountIdr = 0
}) {
    if (!referralCode || !referrerEmail || !orderId) return null;

    const payload = {
        referral_code: normalizePromoCode(referralCode),
        referrer_email: referrerEmail.trim().toLowerCase(),
        buyer_email: (buyerEmail || "").trim().toLowerCase(),
        order_id: String(orderId),
        order_total_idr: Math.round(Number(orderTotalIdr) || 0),
        discount_amount_idr: Math.round(Number(discountAmountIdr) || 0),
        commission_amount_idr: Math.round(Number(commissionAmountIdr) || 0),
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    if (isSupabaseConfigured()) {
        try {
            // 1. Insert ke referral_conversions
            const { data: convData, error: convErr } = await supabaseAdmin
                .from("referral_conversions")
                .insert([payload])
                .select()
                .maybeSingle();

            if (convErr) {
                console.warn("[Referral] recordPendingReferralConversion error:", convErr.message);
            }

            // 2. Tambahkan ke pending_balance_idr di affiliate_profiles
            const affiliate = await findAffiliateByEmail(payload.referrer_email);
            if (affiliate) {
                const currentPending = Number(affiliate.pending_balance_idr) || 0;
                await supabaseAdmin
                    .from("affiliate_profiles")
                    .update({
                        pending_balance_idr: currentPending + payload.commission_amount_idr,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", affiliate.id);
            }

            return convData || payload;
        } catch (err) {
            console.warn("[Referral] Conversion exception, using in-memory:", err.message);
        }
    }

    // In-memory fallback
    const fallbackConv = {
        id: crypto.randomUUID ? crypto.randomUUID() : `conv_${Date.now()}`,
        ...payload
    };
    inMemoryConversions.set(String(orderId), fallbackConv);

    const inMemAff = inMemoryAffiliates.get(payload.referrer_email);
    if (inMemAff) {
        inMemAff.pending_balance_idr = (Number(inMemAff.pending_balance_idr) || 0) + payload.commission_amount_idr;
    }

    return fallbackConv;
}

/**
 * Approve konversi saat pembayaran terverifikasi lunas di duitku-callback.js atau verify-crypto.js
 * Pindahkan saldo dari pending_balance_idr ke available_balance_idr
 */
export async function approveReferralConversion(orderId) {
    if (!orderId) return null;
    const cleanOrderId = String(orderId);

    if (isSupabaseConfigured()) {
        try {
            // Cari data konversi
            const { data: conv, error: selectErr } = await supabaseAdmin
                .from("referral_conversions")
                .select("*")
                .eq("order_id", cleanOrderId)
                .maybeSingle();

            if (!selectErr && conv && conv.status === "pending") {
                const commission = Number(conv.commission_amount_idr) || 0;

                // Update status ke 'approved'
                await supabaseAdmin
                    .from("referral_conversions")
                    .update({
                        status: "approved",
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", conv.id);

                // Update saldo di affiliate_profiles
                const affiliate = await findAffiliateByEmail(conv.referrer_email);
                if (affiliate) {
                    const currentPending = Number(affiliate.pending_balance_idr) || 0;
                    const currentAvailable = Number(affiliate.available_balance_idr) || 0;

                    await supabaseAdmin
                        .from("affiliate_profiles")
                        .update({
                            pending_balance_idr: Math.max(0, currentPending - commission),
                            available_balance_idr: currentAvailable + commission,
                            updated_at: new Date().toISOString()
                        })
                        .eq("id", affiliate.id);
                }

                console.log(`[Referral Approved] Order #${cleanOrderId} - Komisi Rp ${commission.toLocaleString("id-ID")} disetujui untuk ${conv.referrer_email}!`);
                return { success: true, commission, referrerEmail: conv.referrer_email };
            }
        } catch (err) {
            console.warn("[Referral] approveReferralConversion error:", err.message);
        }
    }

    // In-memory fallback
    const memConv = inMemoryConversions.get(cleanOrderId);
    if (memConv && memConv.status === "pending") {
        memConv.status = "approved";
        const commission = Number(memConv.commission_amount_idr) || 0;
        const inMemAff = inMemoryAffiliates.get(memConv.referrer_email);
        if (inMemAff) {
            inMemAff.pending_balance_idr = Math.max(0, (Number(inMemAff.pending_balance_idr) || 0) - commission);
            inMemAff.available_balance_idr = (Number(inMemAff.available_balance_idr) || 0) + commission;
        }
        return { success: true, commission, referrerEmail: memConv.referrer_email };
    }

    return null;
}

// ==============================================================================
// 6. DASHBOARD & VOUCHER EXCHANGE / PAYOUT
// ==============================================================================

/**
 * Ambil data lengkap Dashboard Referral & Affiliate untuk user terautentikasi
 */
export async function getUserReferralDashboard(rawEmail) {
    if (!rawEmail) throw new Error("Email is required");
    const cleanEmail = rawEmail.trim().toLowerCase();

    // 1. Pastikan profil afiliasi sudah ada
    const profile = await getOrCreateAffiliateProfile(cleanEmail);

    let conversions = [];
    let vouchers = [];

    if (isSupabaseConfigured()) {
        try {
            // Ambil 20 riwayat konversi referral
            const { data: convData } = await supabaseAdmin
                .from("referral_conversions")
                .select("*")
                .eq("referrer_email", cleanEmail)
                .order("created_at", { ascending: false })
                .limit(20);

            if (Array.isArray(convData)) {
                conversions = convData;
            }

            // Ambil voucher aktif milik user
            const { data: voucherData } = await supabaseAdmin
                .from("promo_vouchers")
                .select("*")
                .eq("owner_email", cleanEmail)
                .order("created_at", { ascending: false })
                .limit(20);

            if (Array.isArray(voucherData)) {
                vouchers = voucherData;
            }
        } catch (err) {
            console.warn("[Referral Dashboard] Error fetching details:", err.message);
        }
    } else {
        for (const c of inMemoryConversions.values()) {
            if (c.referrer_email === cleanEmail) {
                conversions.push(c);
            }
        }
        for (const v of inMemoryVouchers.values()) {
            if (v.owner_email === cleanEmail) {
                vouchers.push(v);
            }
        }
    }

    // Hitung statistik
    const successfulOrders = conversions.filter(c => c.status === "approved").length;
    const totalEarningsIdr = conversions
        .filter(c => c.status === "approved")
        .reduce((sum, c) => sum + (Number(c.commission_amount_idr) || 0), 0);

    return {
        success: true,
        profile: {
            id: profile.id,
            email: profile.user_email,
            referralCode: profile.referral_code,
            tier: profile.tier || "member",
            discountPercent: Number(profile.discount_percent) || 3,
            commissionPercent: Number(profile.commission_percent) || 5,
            totalClicks: Number(profile.total_clicks) || 0,
            pendingBalanceIdr: Number(profile.pending_balance_idr) || 0,
            availableBalanceIdr: Number(profile.available_balance_idr) || 0
        },
        stats: {
            totalClicks: Number(profile.total_clicks) || 0,
            successfulOrders,
            totalEarningsIdr,
            pendingBalanceIdr: Number(profile.pending_balance_idr) || 0,
            availableBalanceIdr: Number(profile.available_balance_idr) || 0
        },
        conversions: conversions.map(c => ({
            id: c.id,
            orderId: c.order_id,
            orderTotalIdr: Number(c.order_total_idr) || 0,
            commissionAmountIdr: Number(c.commission_amount_idr) || 0,
            status: c.status,
            createdAt: c.created_at,
            buyerMasked: c.buyer_email ? `${c.buyer_email.slice(0, 3)}***@${c.buyer_email.split("@")[1] || "email.com"}` : "Buyer"
        })),
        vouchers: vouchers.map(v => ({
            code: v.code,
            discountType: v.discount_type,
            discountValue: Number(v.discount_value) || 0,
            minOrder: Number(v.min_order_idr) || 0,
            usedCount: v.used_count || 0,
            maxUses: v.max_uses || 1,
            expiresAt: v.expires_at,
            isActive: Boolean(v.is_active && (!v.expires_at || new Date(v.expires_at).getTime() > Date.now()) && (v.used_count < v.max_uses))
        }))
    };
}

/**
 * Konversi saldo komisi yang tersedia menjadi Kode Voucher Belanja Toko Instan
 */
export async function convertBalanceToVoucher({ userEmail, amountIdr }) {
    if (!userEmail) throw new Error("Email is required");
    const cleanEmail = userEmail.trim().toLowerCase();
    const amount = Math.round(Number(amountIdr) || 0);

    if (amount < 5000) {
        throw new Error("Nominal konversi minimal adalah Rp 5.000.");
    }

    const profile = await getOrCreateAffiliateProfile(cleanEmail);
    const available = Number(profile.available_balance_idr) || 0;

    if (available < amount) {
        throw new Error(`Saldo komisi tersedia tidak mencukupi (Tersedia: Rp ${available.toLocaleString("id-ID")}).`);
    }

    // Generate kode voucher unik: e.g. YG-VOUCHER-XXXXX
    const voucherCode = generateRandomCode("YG-REWARD", 5);
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 Hari

    const voucherPayload = {
        code: voucherCode,
        discount_type: "fixed_idr",
        discount_value: amount,
        min_order_idr: 0,
        max_uses: 1,
        used_count: 0,
        owner_email: cleanEmail,
        expires_at: expiresAt,
        is_active: true,
        created_at: new Date().toISOString()
    };

    if (isSupabaseConfigured()) {
        try {
            // 1. Potong saldo komisi
            await supabaseAdmin
                .from("affiliate_profiles")
                .update({
                    available_balance_idr: available - amount,
                    updated_at: new Date().toISOString()
                })
                .eq("id", profile.id);

            // 2. Simpan voucher
            const { data: vData, error: vErr } = await supabaseAdmin
                .from("promo_vouchers")
                .insert([voucherPayload])
                .select()
                .maybeSingle();

            if (!vErr && vData) {
                return {
                    success: true,
                    voucher: vData,
                    remainingBalance: available - amount
                };
            }
        } catch (err) {
            console.warn("[Referral] convertBalanceToVoucher error:", err.message);
        }
    }

    // In-memory fallback
    profile.available_balance_idr = available - amount;
    inMemoryVouchers.set(voucherCode, voucherPayload);

    return {
        success: true,
        voucher: voucherPayload,
        remainingBalance: available - amount
    };
}

/**
 * Permintaan Penarikan Saldo (Payout) ke Crypto / E-Wallet
 */
export async function requestPayout({
    userEmail,
    amountIdr,
    payoutMethod,
    destinationAccount,
    accountName
}) {
    if (!userEmail) throw new Error("Email is required");
    const cleanEmail = userEmail.trim().toLowerCase();
    const amount = Math.round(Number(amountIdr) || 0);

    const MIN_PAYOUT = 50000; // Min Rp 50.000 (~$3.12 USD)
    if (amount < MIN_PAYOUT) {
        throw new Error(`Minimal penarikan saldo adalah Rp ${MIN_PAYOUT.toLocaleString("id-ID")}.`);
    }

    if (!payoutMethod || !destinationAccount) {
        throw new Error("Metode pencairan dan nomor rekening/wallet tujuan wajib diisi.");
    }

    const profile = await getOrCreateAffiliateProfile(cleanEmail);
    const available = Number(profile.available_balance_idr) || 0;

    if (available < amount) {
        throw new Error(`Saldo komisi tersedia tidak mencukupi (Tersedia: Rp ${available.toLocaleString("id-ID")}).`);
    }

    // Potong saldo
    if (isSupabaseConfigured()) {
        try {
            await supabaseAdmin
                .from("affiliate_profiles")
                .update({
                    available_balance_idr: available - amount,
                    updated_at: new Date().toISOString()
                })
                .eq("id", profile.id);
        } catch (err) {
            console.warn("[Referral] requestPayout balance deduction error:", err.message);
        }
    } else {
        profile.available_balance_idr = available - amount;
    }

    // Kirim notifikasi instan ke Telegram Admin
    try {
        const { sendTelegramMessage, isTelegramConfigured } = await import("./telegram.server.js");
        const adminChatId = getEnv("TELEGRAM_ADMIN_CHAT_ID");
        if (isTelegramConfigured() && adminChatId) {
            const msgHtml = [
                `<b>💸 PERMINTAAN PENCAIRAN KOMISI AFILIASI</b>`,
                `━━━━━━━━━━━━━━━━━━━━`,
                `<b>👤 User:</b> ${cleanEmail}`,
                `<b>🏷️ Kode Referral:</b> <code>${profile.referral_code}</code>`,
                `<b>💰 Nominal Payout:</b> Rp ${amount.toLocaleString("id-ID")}`,
                `<b>💳 Kanal Tujuan:</b> ${payoutMethod.toUpperCase()}`,
                `<b>📍 Rekening / Wallet:</b> <code>${destinationAccount}</code>`,
                `<b>📝 Atas Nama:</b> ${accountName || "-"}`,
                `<b>⏰ Waktu Pengajuan:</b> ${new Date().toLocaleString("id-ID")}`,
                `━━━━━━━━━━━━━━━━━━━━`,
                `<i>Silakan proses transfer manual dan konfirmasi ke user.</i>`
            ].join("\n");

            await sendTelegramMessage(adminChatId, msgHtml, { parseMode: "HTML" });
        }
    } catch (tgErr) {
        console.warn("[Referral] Failed to send payout Telegram alert:", tgErr.message);
    }

    return {
        success: true,
        message: "Permintaan penarikan saldo berhasil diajukan dan sedang diproses tim finansial kami.",
        amountPaid: amount,
        remainingBalance: available - amount
    };
}
