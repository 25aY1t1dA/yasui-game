import crypto from "node:crypto";
import { Buffer } from "node:buffer";

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

export const DUITKU_MERCHANT_CODE = getEnv("DUITKU_MERCHANT_CODE") || getEnv("KODE_MERCHANT", "DS27852");
export const DUITKU_API_KEY = getEnv("DUITKU_API_KEY", "3c1091b18de5e4397e8f2292e5276216");
export const DUITKU_ENV = getEnv("DUITKU_ENV", "sandbox");
export const APP_URL = getEnv("APP_URL", "http://localhost:4321").replace(/\/+$/, "");

export const DUITKU_BASE_URL = DUITKU_ENV === "production"
    ? "https://passport.duitku.com/webapi"
    : "https://sandbox.duitku.com/webapi";

/**
 * Daftar channel pembayaran Duitku
 */
export const PAYMENT_CHANNELS = {
    // QRIS
    "qris": { code: "SP", name: "QRIS (Semua Bank & E-Wallet)", type: "qris" },
    "SP": { code: "SP", name: "ShopeePay QRIS", type: "qris" },
    "LQ": { code: "LQ", name: "LinkAja QRIS", type: "qris" },
    "GQ": { code: "GQ", name: "Gudang Voucher QRIS", type: "qris" },

    // Virtual Account (VA)
    "va_bca": { code: "BC", name: "BCA Virtual Account", type: "va", bank: "BCA" },
    "va_mandiri": { code: "M2", name: "Mandiri Virtual Account", type: "va", bank: "MANDIRI" },
    "va_bri": { code: "BR", name: "BRI Virtual Account", type: "va", bank: "BRI" },
    "va_bni": { code: "I1", name: "BNI Virtual Account", type: "va", bank: "BNI" },
    "va_permata": { code: "BT", name: "Permata Virtual Account", type: "va", bank: "PERMATA" },
    "va_cimb": { code: "B1", name: "CIMB Niaga Virtual Account", type: "va", bank: "CIMB" },
    "va_bsi": { code: "BV", name: "BSI Virtual Account", type: "va", bank: "BSI" },

    // E-Wallet
    "ewallet_dana": { code: "DA", name: "DANA", type: "ewallet" },
    "ewallet_ovo": { code: "OV", name: "OVO", type: "ewallet" },
    "ewallet_shopeepay": { code: "SA", name: "ShopeePay App", type: "ewallet" },

    // Retail
    "retail_indomaret": { code: "IR", name: "Indomaret", type: "retail" },

    // Kartu Kredit / International Card (Visa, Mastercard, JCB)
    "credit_card": { code: "VC", name: "Visa / Mastercard / JCB (Credit/Debit Card)", type: "credit_card" },
    "VC": { code: "VC", name: "Visa / Mastercard / JCB (Credit/Debit Card)", type: "credit_card" },
    "global": { code: "VC", name: "Visa / Mastercard / JCB (Credit/Debit Card)", type: "credit_card" }
};

/**
 * Generate Signature untuk Inquiry V2
 * Rumus: MD5(merchantCode + merchantOrderId + paymentAmount + apiKey)
 */
export function generateInquirySignature(merchantOrderId, paymentAmount) {
    const raw = `${DUITKU_MERCHANT_CODE}${merchantOrderId}${paymentAmount}${DUITKU_API_KEY}`;
    return crypto.createHash("md5").update(raw).digest("hex");
}

/**
 * Generate Signature untuk Check Transaction Status
 * Rumus: MD5(merchantCode + merchantOrderId + apiKey)
 */
export function generateStatusSignature(merchantOrderId) {
    const raw = `${DUITKU_MERCHANT_CODE}${merchantOrderId}${DUITKU_API_KEY}`;
    return crypto.createHash("md5").update(raw).digest("hex");
}

/**
 * Verifikasi Signature Callback dari Duitku
 * Rumus: MD5(merchantCode + amount + merchantOrderId + apiKey)
 */
export function verifyCallbackSignature(merchantCode, amount, merchantOrderId, signature) {
    const raw = `${merchantCode}${amount}${merchantOrderId}${DUITKU_API_KEY}`;
    const calculated = crypto.createHash("md5").update(raw).digest("hex");
    return calculated.toLowerCase() === String(signature).toLowerCase();
}

/**
 * Request Inquiry ke Duitku (Buat Transaksi Baru)
 */
export async function createDuitkuInquiry({
    merchantOrderId,
    paymentAmount,
    paymentMethod = "SP",
    productDetails = "Yasui Game Order",
    email,
    phoneNumber = "08123456789",
    customerVaName = "Yasui Buyer",
    callbackUrl = null,
    returnUrl = null,
    expiryPeriod = 15 // 15 menit
}) {
    const finalCallbackUrl = callbackUrl || `${APP_URL}/api/payment/duitku-callback`;
    const finalReturnUrl = returnUrl || `${APP_URL}/order-success?id=${merchantOrderId}`;
    const cleanAmount = Math.round(Number(paymentAmount));

    const signature = generateInquirySignature(merchantOrderId, cleanAmount);

    const payload = {
        merchantCode: DUITKU_MERCHANT_CODE,
        paymentAmount: cleanAmount,
        paymentMethod,
        merchantOrderId,
        productDetails,
        email,
        phoneNumber,
        customerVaName,
        callbackUrl: finalCallbackUrl,
        returnUrl: finalReturnUrl,
        expiryPeriod,
        signature
    };

    console.log(`[Duitku Inquiry] Requesting payment for order ${merchantOrderId} (Rp ${cleanAmount}) via ${paymentMethod}...`);

    const response = await fetch(`${DUITKU_BASE_URL}/api/merchant/v2/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || data.statusCode !== "00") {
        console.error("[Duitku Inquiry Error]", data);
        throw new Error(data.statusMessage || `Duitku Inquiry failed with code ${data.statusCode}`);
    }

    console.log(`[Duitku Inquiry Success] Ref: ${data.reference}, Status: ${data.statusCode}`);
    return data;
}

/**
 * Cek Status Transaksi ke Duitku
 * Response:
 * - statusCode "00": SUCCESS (Lunas)
 * - statusCode "01": PROCESS (Menunggu pembayaran)
 * - statusCode "02": FAILED / EXPIRED
 */
export async function checkDuitkuTransactionStatus(merchantOrderId) {
    const signature = generateStatusSignature(merchantOrderId);

    const response = await fetch(`${DUITKU_BASE_URL}/api/merchant/transactionStatus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            merchantCode: DUITKU_MERCHANT_CODE,
            merchantOrderId,
            signature
        })
    });

    const data = await response.json();
    return data;
}
