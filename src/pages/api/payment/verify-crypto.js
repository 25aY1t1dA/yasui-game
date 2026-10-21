import { getOrder, updateOrder, verifySessionToken } from "../../../lib/wc";
import {
    isCryptoChannel,
    getCryptoChannelConfig,
    verifyOnChainTransaction,
    isTxHashAlreadyUsed,
    recordVerifiedCryptoPayment,
    sendTelegramCryptoAlert
} from "../../../lib/crypto-payment.server";
import { sendOrderAlertToTelegram } from "../../../lib/telegram.server";
import { approveReferralConversion } from "../../../lib/referral-promo.server";

export const POST = async ({ request, url }) => {
    try {
        let body = {};
        try {
            body = await request.json();
        } catch (e) {
            return new Response(JSON.stringify({
                success: false,
                error: "Format request body JSON tidak valid."
            }), { status: 400 });
        }

        const orderId = body.orderId || body.id || url.searchParams.get("id");
        let orderKey = body.orderKey || body.key || url.searchParams.get("key") || "";
        let token = body.token || url.searchParams.get("token") || "";
        const txHash = body.txHash || body.txid || body.hash || "";

        const authHeader = request.headers.get("Authorization") || "";
        if (authHeader.startsWith("Bearer ")) {
            token = authHeader.replace(/^Bearer\s+/i, "").trim();
        }

        const cleanOrderId = parseInt(orderId, 10);
        if (!cleanOrderId || isNaN(cleanOrderId) || cleanOrderId <= 0) {
            return new Response(JSON.stringify({
                success: false,
                error: "Parameter ID pesanan tidak valid atau belum diisi."
            }), { status: 400 });
        }

        if (!txHash || typeof txHash !== "string" || txHash.trim().length < 10) {
            return new Response(JSON.stringify({
                success: false,
                error: "Transaction Hash (TxID / TxHash) wajib diisi."
            }), { status: 400 });
        }

        const cleanTxHash = txHash.trim();

        // 1. Ambil Data Pesanan dari WooCommerce (Bypass Cache)
        const order = await getOrder(cleanOrderId, { bypassCache: true });
        if (!order || !order.id) {
            return new Response(JSON.stringify({
                success: false,
                error: "Pesanan tidak ditemukan di sistem Yasui Game."
            }), { status: 404 });
        }

        // 2. Proteksi IDOR & Sesi
        const billingEmail = (order.billing?.email || "").trim().toLowerCase();
        const isKeyMatch = Boolean(orderKey && order.order_key === orderKey);
        const isSessionValid = Boolean(token && billingEmail && verifySessionToken(token, billingEmail));

        if (!isKeyMatch && !isSessionValid) {
            return new Response(JSON.stringify({
                success: false,
                error: "Akses Ditolak: Kunci verifikasi pesanan (order key) atau sesi tidak sah."
            }), { status: 403 });
        }

        // 3. Jika Pesanan Sudah Lunas / Terverifikasi Sebelumnya
        if (order.status === "processing" || order.status === "completed") {
            return new Response(JSON.stringify({
                success: true,
                status: "paid",
                orderId: order.id,
                message: "Pesanan ini sudah lunas dan sedang diproses.",
                redirectUrl: `/order-success?id=${order.id}&key=${encodeURIComponent(order.order_key)}`
            }), { status: 200 });
        }

        if (order.status === "cancelled" || order.status === "failed") {
            return new Response(JSON.stringify({
                success: false,
                error: "Pesanan ini sudah dibatalkan atau kedaluwarsa. Silakan lakukan pemesanan baru."
            }), { status: 400 });
        }

        // 4. Ekstraksi Metadata Crypto dari Pesanan
        const meta = order.meta_data || [];
        const findMeta = (k) => meta.find(m => m.key === k)?.value;

        const paymentChannel = findMeta("_crypto_payment_channel") || order.payment_method;
        if (!isCryptoChannel(paymentChannel)) {
            return new Response(JSON.stringify({
                success: false,
                error: "Pesanan ini tidak menggunakan metode pembayaran Crypto On-Chain."
            }), { status: 400 });
        }

        const channelConfig = getCryptoChannelConfig(paymentChannel);
        const expectedAmount = findMeta("_crypto_expected_amount");
        const walletAddress = findMeta("_crypto_wallet_address") || channelConfig.walletAddress;
        const expiryTime = Number(findMeta("_crypto_expiry_time"));

        if (!expectedAmount) {
            return new Response(JSON.stringify({
                success: false,
                error: "Data nominal tagihan crypto tidak ditemukan pada pesanan."
            }), { status: 400 });
        }

        // Periksa Kedaluwarsa Transaksi
        if (expiryTime && Date.now() > expiryTime) {
            try {
                await updateOrder(order.id, { status: "cancelled" });
            } catch (cancelErr) {}
            return new Response(JSON.stringify({
                success: false,
                error: "Sesi waktu pembayaran pesanan ini telah habis (Expired). Silakan buat pesanan baru."
            }), { status: 400 });
        }

        // 5. Proteksi Anti-Double-Spend (Replay Attack Prevention)
        const alreadyClaimed = await isTxHashAlreadyUsed(cleanTxHash);
        const currentOrderExistingTx = findMeta("_crypto_tx_hash");

        if (alreadyClaimed && currentOrderExistingTx !== cleanTxHash) {
            return new Response(JSON.stringify({
                success: false,
                error: "Transaction Hash ini sudah pernah digunakan untuk melunasi pesanan lain! Percobaan double-spend atau replay attack dicegah."
            }), { status: 400 });
        }

        // 6. Eksekusi Mesin Verifikasi On-Chain (EVM / TRON)
        let verificationResult = null;
        try {
            verificationResult = await verifyOnChainTransaction({
                txHash: cleanTxHash,
                paymentChannel,
                expectedAmount,
                walletAddress
            });
        } catch (onChainError) {
            console.warn(`[On-Chain Verification Rejected for Order #${order.id}]:`, onChainError.message);
            return new Response(JSON.stringify({
                success: false,
                error: onChainError.message || "Gagal memverifikasi transaksi di blockchain."
            }), { status: 400 });
        }

        // 7. Mutasi Status Pesanan di WooCommerce menjadi PROCESSING / LUNAS
        await updateOrder(order.id, {
            status: "processing",
            set_paid: true,
            meta_data: [
                { key: "_crypto_tx_hash", value: verificationResult.txHash },
                { key: "_crypto_sender_address", value: verificationResult.senderAddress || "" },
                { key: "_crypto_paid_amount", value: String(verificationResult.actualAmount) },
                { key: "_crypto_verified_at", value: new Date().toISOString() },
                { key: "_crypto_status", value: "CONFIRMED" }
            ]
        });

        // 8. Catat ke Tabel Database Supabase untuk Anti-Double-Spend Permanen
        await recordVerifiedCryptoPayment({
            orderId: order.id,
            txHash: verificationResult.txHash,
            network: verificationResult.network,
            tokenSymbol: verificationResult.token,
            amount: verificationResult.actualAmount,
            senderAddress: verificationResult.senderAddress,
            recipientAddress: verificationResult.recipientAddress,
            blockNumber: verificationResult.blockNumber
        });

        // 8b. Setujui Komisi Referral jika Pesanan Menggunakan Kode Afiliasi
        try {
            await approveReferralConversion(order.id);
        } catch (refErr) {
            console.warn("[Verify Crypto] Failed to approve referral conversion:", refErr.message);
        }

        // 9. Kirim Notifikasi Konfirmasi Pesanan Lunas ke Grup Telegram Admin
        try {
            await sendOrderAlertToTelegram(order, {
                method: `Crypto ${verificationResult.token} (${channelConfig.name})`,
                txHash: verificationResult.txHash,
                explorerLink: `${channelConfig.explorerBase}${verificationResult.txHash}`,
                actualAmount: verificationResult.actualAmount,
                token: verificationResult.token,
                network: verificationResult.network
            });
        } catch (alertErr) {
            console.warn("[Verify Crypto] Failed to send Telegram order alert:", alertErr.message);
        }

        return new Response(JSON.stringify({
            success: true,
            status: "paid",
            message: "Pembayaran berhasil diverifikasi secara on-chain di blockchain!",
            orderId: order.id,
            txHash: verificationResult.txHash,
            actualAmount: verificationResult.actualAmount,
            token: verificationResult.token,
            network: verificationResult.network,
            redirectUrl: `/order-success?id=${order.id}&key=${encodeURIComponent(order.order_key)}`
        }), { status: 200 });

    } catch (err) {
        console.error("[Verify Crypto Error]", err);
        return new Response(JSON.stringify({
            success: false,
            error: err.message || "Terjadi kesalahan internal saat memverifikasi pembayaran crypto."
        }), { status: 500 });
    }
};
