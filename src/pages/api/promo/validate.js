import { validatePromoOrReferralCode } from "../../../lib/referral-promo.server.js";

export const POST = async ({ request }) => {
    try {
        let body = {};
        try {
            body = await request.json();
        } catch (e) {
            return new Response(JSON.stringify({
                success: false,
                valid: false,
                error: "Format JSON tidak valid."
            }), { status: 400 });
        }

        const { code, cartTotal, email, targetInfo, buyerWa } = body;

        if (!code || typeof code !== "string" || !code.trim()) {
            return new Response(JSON.stringify({
                success: false,
                valid: false,
                error: "Kode promo atau referral wajib diisi."
            }), { status: 400 });
        }

        const validation = await validatePromoOrReferralCode({
            code: code.trim(),
            cartTotalIdr: Number(cartTotal) || 0,
            buyerEmail: email || "",
            orderTargetDetails: targetInfo ? [targetInfo] : [],
            buyerWa: buyerWa || ""
        });

        if (!validation.valid) {
            return new Response(JSON.stringify({
                success: false,
                valid: false,
                error: validation.message,
                errorCode: validation.error
            }), { status: 400 });
        }

        return new Response(JSON.stringify({
            success: true,
            valid: true,
            promo: {
                code: validation.code,
                type: validation.type,
                discountAmount: validation.discountAmount,
                discountPercent: validation.discountPercent || 0,
                description: validation.description,
                tier: validation.tier || null,
                referrerEmail: validation.referrerEmail || null
            }
        }), { status: 200 });

    } catch (error) {
        console.error("[API Promo Validate Error]", error);
        return new Response(JSON.stringify({
            success: false,
            valid: false,
            error: "Terjadi kesalahan internal saat memvalidasi kode promo."
        }), { status: 500 });
    }
};
