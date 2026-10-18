import { getOrder, updateOrder } from "../../../lib/wc";
import { checkDuitkuTransactionStatus } from "../../../lib/duitku";

export const ALL = async ({ request, url }) => {
    try {
        let orderId = url.searchParams.get("id");
        if (!orderId && request.method === "POST") {
            try {
                const body = await request.json();
                orderId = body.id || body.orderId;
            } catch (e) {}
        }

        if (!orderId) {
            return new Response(JSON.stringify({
                success: false,
                error: "Order ID diperlukan"
            }), { status: 400 });
        }

        // 1. Ambil Data Order dari WooCommerce
        const order = await getOrder(orderId);
        if (!order || !order.id) {
            return new Response(JSON.stringify({
                success: false,
                error: "Pesanan tidak ditemukan"
            }), { status: 404 });
        }

        // Jika status sudah selesai atau diproses
        if (order.status === "processing" || order.status === "completed") {
            return new Response(JSON.stringify({
                success: true,
                status: "paid",
                orderId: order.id,
                orderStatus: order.status
            }), { status: 200 });
        }

        // Jika sudah dibatalkan atau gagal
        if (order.status === "cancelled" || order.status === "failed") {
            return new Response(JSON.stringify({
                success: true,
                status: "failed",
                orderId: order.id,
                orderStatus: order.status
            }), { status: 200 });
        }

        // 2. Ambil Merchant Order ID Duitku dari Meta Data
        const metaList = order.meta_data || [];
        const merchantOrderMeta = metaList.find(m => m.key === "_duitku_merchant_order_id");
        const merchantOrderId = merchantOrderMeta ? merchantOrderMeta.value : null;

        if (!merchantOrderId) {
            return new Response(JSON.stringify({
                success: true,
                status: "pending",
                orderId: order.id,
                orderStatus: order.status,
                message: "Transaksi Duitku belum terasosiasi"
            }), { status: 200 });
        }

        // 3. Cek Status Langsung ke Gateway Duitku
        const duitkuStatus = await checkDuitkuTransactionStatus(merchantOrderId);

        if (duitkuStatus && duitkuStatus.statusCode === "00") {
            // PEMBAYARAN BERHASIL (LUNAS)
            console.log(`[Auto Check-Status] Order #${order.id} terkonfirmasi LUNAS via Duitku! Mengupdate status ke processing.`);
            await updateOrder(order.id, {
                status: "processing",
                set_paid: true
            });

            return new Response(JSON.stringify({
                success: true,
                status: "paid",
                orderId: order.id,
                duitkuReference: duitkuStatus.reference,
                amount: duitkuStatus.amount
            }), { status: 200 });
        }

        if (duitkuStatus && duitkuStatus.statusCode === "02") {
            // PEMBAYARAN KADALUARSA / GAGAL
            console.log(`[Auto Check-Status] Order #${order.id} KADALUARSA/GAGAL di Duitku.`);
            await updateOrder(order.id, {
                status: "failed"
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
        console.error("Check Status Error:", error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500 });
    }
};
