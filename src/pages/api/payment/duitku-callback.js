import { updateOrder, getOrder } from "../../../lib/wc";
import { verifyCallbackSignature, DUITKU_MERCHANT_CODE } from "../../../lib/duitku";

export const POST = async ({ request }) => {
    try {
        let params = {};
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            params = await request.json();
        } else {
            const formData = await request.formData();
            for (const [key, value] of formData.entries()) {
                params[key] = value;
            }
        }

        const {
            merchantCode,
            amount,
            merchantOrderId,
            signature,
            resultCode,
            reference,
            additionalParam
        } = params;

        console.log(`[Duitku Webhook Received] Order: ${merchantOrderId}, Amount: ${amount}, Result: ${resultCode}`);

        if (!merchantCode || !merchantOrderId || !signature) {
            return new Response("Invalid Callback Payload", { status: 400 });
        }

        // 1. Verifikasi Signature Duitku
        const isValid = verifyCallbackSignature(merchantCode, amount, merchantOrderId, signature);
        if (!isValid) {
            console.error(`[Duitku Webhook Error] Invalid Signature for order ${merchantOrderId}!`);
            return new Response("Bad Signature", { status: 400 });
        }

        // 2. Ekstrak WooCommerce Order ID dari merchantOrderId (Format: YG-{orderId}-{random})
        let wcOrderId = null;
        if (merchantOrderId.startsWith("YG-")) {
            const parts = merchantOrderId.split("-");
            if (parts.length >= 2) {
                wcOrderId = parseInt(parts[1]);
            }
        } else if (additionalParam && !isNaN(additionalParam)) {
            wcOrderId = parseInt(additionalParam);
        }

        if (!wcOrderId) {
            console.warn(`[Duitku Webhook] Tidak dapat menemukan Order ID dari ${merchantOrderId}`);
            return new Response("Order ID Not Resolved", { status: 400 });
        }

        // 3. Update Status Order di WooCommerce
        if (resultCode === "00") {
            console.log(`[Duitku Webhook Success] Order #${wcOrderId} dibayar lunas! Memperbarui status ke 'processing'.`);
            await updateOrder(wcOrderId, {
                status: "processing",
                set_paid: true,
                meta_data: [
                    { key: "_duitku_payment_status", value: "SUCCESS" },
                    { key: "_duitku_paid_reference", value: reference || "" },
                    { key: "_duitku_paid_at", value: new Date().toISOString() }
                ]
            });
            return new Response("SUCCESS", { status: 200 });
        } else {
            console.warn(`[Duitku Webhook Failed] Order #${wcOrderId} pembayaran gagal/dibatalkan (Code: ${resultCode})`);
            await updateOrder(wcOrderId, {
                status: "failed",
                meta_data: [
                    { key: "_duitku_payment_status", value: "FAILED" },
                    { key: "_duitku_fail_code", value: resultCode }
                ]
            });
            return new Response("FAILED", { status: 200 });
        }

    } catch (error) {
        console.error("[Duitku Webhook Exception]:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
};
