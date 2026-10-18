import { createOrder, updateOrder, findOrCreateCustomer, generateSessionToken, getProductById } from '../../lib/wc';
import { createDuitkuInquiry, PAYMENT_CHANNELS } from '../../lib/duitku';
import { isValidEmail, sanitizeText } from '../../lib/sanitize';
import QRCode from 'qrcode';

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        const { cartItems, customerInfo, paymentCategory } = body || {};

        // 1. Validasi Input Keranjang & Email
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0 || cartItems.length > 50) {
            return new Response(JSON.stringify({
                success: false,
                error: "Keranjang belanja tidak valid atau kosong (maksimal 50 item)."
            }), { status: 400 });
        }

        if (!customerInfo || !customerInfo.email || !isValidEmail(customerInfo.email)) {
            return new Response(JSON.stringify({
                success: false,
                error: "Alamat email pelanggan tidak valid atau belum diisi."
            }), { status: 400 });
        }

        const cleanEmail = customerInfo.email.trim().toLowerCase();
        const cleanName = sanitizeText(customerInfo.name || "Customer", 60);
        const cleanWa = sanitizeText(customerInfo.wa || "", 30);
        const cleanDiscord = sanitizeText(customerInfo.discord || "", 50);

        // 2. Sanitasi & Validasi Line Items serta Verifikasi Ketersediaan Stok Real-Time
        const lineItems = [];
        for (const item of cartItems) {
            const productId = parseInt(item.id, 10);
            const quantity = Math.max(1, Math.min(99, parseInt(item.quantity || 1, 10)));

            if (!productId || isNaN(productId) || productId <= 0) {
                return new Response(JSON.stringify({
                    success: false,
                    error: "Format ID produk pada keranjang tidak valid."
                }), { status: 400 });
            }

            // Real-Time Stock & Existence Check di WooCommerce
            const product = await getProductById(productId, { bypassCache: true });
            if (!product || !product.id) {
                return new Response(JSON.stringify({
                    success: false,
                    error: `Produk ID #${productId} tidak ditemukan di katalog toko.`
                }), { status: 400 });
            }

            if (product.stock_status === "outofstock") {
                return new Response(JSON.stringify({
                    success: false,
                    error: `Produk "${product.name || productId}" saat ini sedang habis.`
                }), { status: 400 });
            }

            lineItems.push({
                product_id: productId,
                quantity: quantity
            });
        }

        // 3. Auto-Create / Hubungkan Customer WooCommerce
        let customerId = 0;
        try {
            const customer = await findOrCreateCustomer({
                email: cleanEmail,
                firstName: cleanName,
                phone: cleanWa,
            });
            if (customer && customer.id) {
                customerId = customer.id;
            }
        } catch (e) {
            console.warn("Lanjut sebagai guest karena pembuatan customer gagal:", e.message);
        }

        // Tentukan Nama Metode Pembayaran
        const selectedChannel = PAYMENT_CHANNELS[paymentCategory] || PAYMENT_CHANNELS["qris"];
        const methodCode = selectedChannel.code || "SP";
        const methodName = selectedChannel.name || "QRIS";

        // 4. Payload Order untuk WooCommerce REST API
        const orderPayload = {
            payment_method: 'duitku',
            payment_method_title: `Duitku - ${methodName}`,
            set_paid: false,
            customer_id: customerId,
            billing: {
                first_name: cleanName,
                last_name: "",
                email: cleanEmail,
                phone: cleanWa,
                address_1: "Digital Product Delivery",
                city: "Jakarta",
                postcode: "12345",
                country: "ID",
            },
            line_items: lineItems,
            customer_note: `WA: ${cleanWa || '-'} | Email: ${cleanEmail} | Discord: ${cleanDiscord || '-'} | Method: ${methodName} (${methodCode})`
        };

        const order = await createOrder(orderPayload);
        const orderTotal = Math.round(Number(order.total) || 0);

        // 5. Request Duitku Inquiry (Headless)
        const merchantOrderId = `YG-${order.id}-${Math.floor(1000 + Math.random() * 9000)}`;
        const productSummary = cartItems
            .map(i => sanitizeText(i.name || "Item", 30))
            .join(", ")
            .slice(0, 100);

        let duitkuRes = null;
        let qrDataUrl = null;

        try {
            duitkuRes = await createDuitkuInquiry({
                merchantOrderId,
                paymentAmount: orderTotal,
                paymentMethod: methodCode,
                productDetails: productSummary || "Yasui Game Digital Account",
                email: cleanEmail,
                phoneNumber: cleanWa && cleanWa !== "-" ? cleanWa : "08123456789",
                customerVaName: cleanName || "Yasui Buyer",
                expiryPeriod: 15 // 15 Menit
            });

            // Jika QRIS, generate Data URL QR Code
            if (duitkuRes.qrString) {
                qrDataUrl = await QRCode.toDataURL(duitkuRes.qrString, {
                    width: 320,
                    margin: 2,
                    color: { dark: "#000000", light: "#ffffff" }
                });
            }

            // Simpan metadata Duitku ke Order WooCommerce
            await updateOrder(order.id, {
                meta_data: [
                    { key: "_duitku_merchant_order_id", value: merchantOrderId },
                    { key: "_duitku_reference", value: duitkuRes.reference || "" },
                    { key: "_duitku_payment_method", value: methodCode },
                    { key: "_duitku_payment_method_name", value: methodName },
                    { key: "_duitku_va_number", value: duitkuRes.vaNumber || "" },
                    { key: "_duitku_qr_string", value: duitkuRes.qrString || "" },
                    { key: "_duitku_payment_url", value: duitkuRes.paymentUrl || "" },
                    { key: "_duitku_expiry_time", value: String(Date.now() + 15 * 60 * 1000) }
                ]
            });
        } catch (duitkuError) {
            console.error("Duitku Inquiry Failed:", duitkuError.message);
            throw new Error(`Gagal menghubungi gateway pembayaran Duitku: ${duitkuError.message}`);
        }

        // 6. Headless Order Pay URL dengan Proteksi Order Key
        const paymentPayUrl = `/order-pay?id=${order.id}&key=${encodeURIComponent(order.order_key)}`;

        // 7. Generate Signed Session Token (Otomatis login 30 hari untuk pembeli)
        const userSession = generateSessionToken(cleanEmail);

        return new Response(JSON.stringify({
            success: true,
            order: {
                id: order.id,
                orderKey: order.order_key,
                orderNumber: order.number || order.id,
                merchantOrderId,
                status: order.status,
                total: order.total,
                currency: order.currency
            },
            session: {
                token: userSession.token,
                expiresAt: userSession.expiresAt,
                email: cleanEmail,
                name: cleanName
            },
            payment: {
                method: methodCode,
                methodName: methodName,
                reference: duitkuRes.reference,
                vaNumber: duitkuRes.vaNumber || null,
                qrString: duitkuRes.qrString || null,
                qrDataUrl: qrDataUrl,
                paymentUrl: duitkuRes.paymentUrl || null
            },
            paymentUrl: paymentPayUrl
        }), { status: 200 });

    } catch (error) {
        console.error("Create Order Error:", error.message);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Gagal membuat pesanan."
        }), { status: 500 });
    }
};
