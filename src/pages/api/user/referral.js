import { verifySessionToken } from "../../../lib/wc.js";
import {
    getUserReferralDashboard,
    convertBalanceToVoucher,
    requestPayout,
    recordReferralClick
} from "../../../lib/referral-promo.server.js";

export const ALL = async ({ request }) => {
    try {
        let body = {};
        if (request.method === "POST") {
            try {
                body = await request.json();
            } catch (e) {
                // query params or empty body
            }
        }

        const url = new URL(request.url);
        const action = body.action || url.searchParams.get("action") || "get_dashboard";

        // 1. Publik: Tracking Click Referral (?ref=CODE)
        if (action === "track_click") {
            const refCode = body.referralCode || url.searchParams.get("code");
            if (refCode) {
                await recordReferralClick(refCode);
            }
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        // 2. Autentikasi Pengguna untuk Dashboard, Konversi Voucher & Payout
        const email = (body.email || url.searchParams.get("email") || "").trim().toLowerCase();
        const authHeader = request.headers.get("Authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim() || body.token || url.searchParams.get("token");

        if (!email || !email.includes("@")) {
            return new Response(JSON.stringify({
                success: false,
                error: "Alamat email diperlukan untuk mengakses dashboard referral."
            }), { status: 400 });
        }

        // Verifikasi token sesi
        const isAuthorized = verifySessionToken(token, email);
        if (!isAuthorized) {
            return new Response(JSON.stringify({
                success: false,
                error: "Sesi tidak sah atau telah kedaluwarsa. Silakan masuk kembali."
            }), { status: 401 });
        }

        // 3. Router Action Dashboard
        if (action === "convert_to_voucher") {
            const amount = Number(body.amount) || 0;
            const result = await convertBalanceToVoucher({
                userEmail: email,
                amountIdr: amount
            });
            return new Response(JSON.stringify(result), { status: 200 });
        }

        if (action === "request_payout") {
            const result = await requestPayout({
                userEmail: email,
                amountIdr: Number(body.amount) || 0,
                payoutMethod: body.payoutMethod || "USDT",
                destinationAccount: body.destinationAccount || "",
                accountName: body.accountName || ""
            });
            return new Response(JSON.stringify(result), { status: 200 });
        }

        // Default: Get Dashboard data
        const dashboardData = await getUserReferralDashboard(email);
        return new Response(JSON.stringify(dashboardData), { status: 200 });

    } catch (error) {
        console.error("[API User Referral Error]", error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Terjadi kesalahan internal pada layanan referral."
        }), { status: 500 });
    }
};
