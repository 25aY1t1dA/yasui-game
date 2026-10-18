import { getOrder, updateOrder, verifySessionToken } from "../../../lib/wc";
import { checkDuitkuTransactionStatus } from "../../../lib/duitku";

export const ALL = async ({ request, url }) => {
    try {
        let orderId = url.searchParams.get("id");
        let orderKey = url.searchParams.get("key") || "";
        let token = url.searchParams.get("token") || "";

        const authHeader = request.headers.get("Authorization") || "";
        if (authHeader.startsWith("Bearer ")) {
            token = authHeader.replace(/^Bearer\s+/i, "").trim();
        }

        if (!orderId && (request.method === "POST" || request.method === "PUT")) {
            try {
                const body = await request.json();
                orderId = body.id || body.orderId;
                if (!orderKey) orderKey = body.key || body.orderKey || "";
                if (!token) token = body.token || "";
            } catch (e) {}
        }

        const cleanOrderId = parseInt(orderId, 10);
        if (!cleanOrderId || isNaN(cleanOrderId) || cleanOrderId <= 0) {
            return new Response(JSON.stringify({
                success: false,
                error: "Parameter ID pesanan tidak valid atau kosong."
            }), { status: 400 });
        }

        // 1. Ambil Data Order dari WooCommerce (Bypass Cache untuk real-time status)
        const order = await getOrder(cleanOrderId, { bypassCache: true });
        if (!order || !order.id) {
            return new Response(JSON.stringify({
                success: false,
                error: "Pesanan tidak ditemukan di sistem."
            }), { status: 404 });
        }

        // 2. Proteksi IDOR & Enumeration: Verifikasi Order Key atau Session Token
        const billingEmail = (order.billing?.email || "").trim().toLowerCase();
        const isKeyMatch = Boolean(orderKey && order.order_key === orderKey);
        const isSessionValid = Boolean(token && billingEmail && verifySessionToken(token, billingEmail));

        if (!isKeyMatch && !isSessionValid) {
            return new Response(JSON.stringify({
                success: false,
                error: "Akses ditolak: Kunci pesanan (key) atau sesi akun tidak valid."
            }), { status: 403 });
        }

        // 3. Jika status sudah selesai atau diproses
        if (order.status === "processing" || order.status === "completed") {
            return new Response(JSON.stringify({
                success: true,
                status: "paid",
                orderId: order.id,
                orderStatus: order.status
            }), { status: 200 });
        }

        // 4. Jika sudah dibatalkan atau gagal
        if (order.status === "cancelled" || order.status === "failed") {
            return new Response(JSON.stringify({
                success: true,
                status: "failed",
                orderId: order.id,
                orderStatus: order.status
            }), { status: 200 });
        }

        // 5. Ambil Merchant Order ID Duitku dari Meta Data
        const metaList = order.meta_data || [];
        const merchantOrderMeta = metaList.find(m => m.key === "_duitku_merchant_order_id");
        const merchantOrderId = merchantOrderMeta ? merchantOrderMeta.value : null;

        if (!merchantOrderId) {
            return new Response(JSON.stringify({
                success: true,
                status: "pending",
                orderId: order.id,
                orderStatus: order.status,
                message: "Menunggu inisialisasi gateway pembayaran"
            }), { status: 200 });
        }

        // 6. Cek Status Langsung ke Gateway Duitku
        const duitkuStatus = await checkDuitkuTransactionStatus(merchantOrderId);

        if (duitkuStatus && duitkuStatus.statusCode === "00") {
            // PEMBAYARAN BERHASIL (LUNAS)
            console.log(`[Auto Check-Status] Order #${order.id} terkonfirmasi LUNAS via Duitku.`);
            await updateOrder(order.id, {
                status: "processing",
                set_paid: true,
                meta_data: [
                    { key: "_duitku_payment_status", value: "SUCCESS" },
                    { key: "_duitku_paid_reference", value: duitkuStatus.reference || "" },
                    { key: "_duitku_paid_at", value: new Date().toISOString() }
                ]
            });

            return new Response(JSON.stringify({
                success: true,
                status: "paid",
                orderId: order.id,
                reference: duitkuStatus.reference,
                amount: duitkuStatus.amount
            }), { status: 200 });
        }

        if (duitkuStatus && duitkuStatus.statusCode === "02") {
            // PEMBAYARAN KADALUARSA / GAGAL
            console.log(`[Auto Check-Status] Order #${order.id} KADALUARSA/GAGAL di Duitku.`);
            await updateOrder(order.id, {
                status: "failed",
                meta_data: [
                    { key: "_duitku_payment_status", value: "FAILED" },
                    { key: "_duitku_fail_code", value: duitkuStatus.statusCode }
                ]
            });

            return new Response(JSON.stringify({
                success: true,
                status: "expired",
                orderId: order.id
            }), { status: 200 });
        }

        // MASIH MENUNGGU PEMBAYARAN (PROCESS / PENDING)
        return new Response(JSON.stringify({
            success: true,
            status: "pending",
            orderId: order.id,
            duitkuStatus: duitkuStatus.statusCode,
            message: duitkuStatus.statusMessage || "Menunggu Pembayaran"
        }), { status: 200 });

    } catch (error) {
        console.error("Check Status Error:", error.message);
        return new Response(JSON.stringify({
            success: false,
            error: "Gagal memeriksa status pembayaran."
        }), { status: 500 });
    }
};
