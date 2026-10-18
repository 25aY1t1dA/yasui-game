import { createOrder, updateOrder, findOrCreateCustomer, generateSessionToken } from '../../lib/wc';
import { createDuitkuInquiry, PAYMENT_CHANNELS } from '../../lib/duitku';
import QRCode from 'qrcode';

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        const { cartItems, customerInfo, paymentCategory } = body;

        if (!cartItems || cartItems.length === 0 || !customerInfo?.email) {
            return new Response(JSON.stringify({
                success: false,
                error: "Data checkout tidak lengkap (keranjang kosong atau email tidak ada)."
            }), { status: 400 });
        }

        // 1. FITUR AUTO-CREATE AKUN / HUBUNGKAN CUSTOMER WOOCOMMERCE
        let customerId = 0;
        try {
            const customer = await findOrCreateCustomer({
                email: customerInfo.email,
                firstName: customerInfo.name || "Customer",
                phone: customerInfo.wa || "",
            });
            if (customer && customer.id) {
                customerId = customer.id;
            }
        } catch (e) {
            console.warn("Lanjut sebagai guest karena pembuatan customer gagal:", e.message);
        }

        // 2. Siapkan Line Items
        const lineItems = cartItems.map(item => ({
            product_id: parseInt(item.id),
            quantity: item.quantity ? parseInt(item.quantity) : 1
        }));

        // Tentukan Nama Metode Pembayaran
        const selectedChannel = PAYMENT_CHANNELS[paymentCategory] || PAYMENT_CHANNELS["qris"];
        const methodCode = selectedChannel.code || "SP";
        const methodName = selectedChannel.name || "QRIS";

        // 3. Payload Order untuk WooCommerce REST API
        const orderPayload = {
            payment_method: 'duitku',
            payment_method_title: `Duitku - ${methodName}`,
            set_paid: false,
            customer_id: customerId,
            billing: {
                first_name: customerInfo.name || "Customer",
                last_name: "",
                email: customerInfo.email,
                phone: customerInfo.wa || "",
                address_1: "Digital Product Delivery",
                city: "Jakarta",
                postcode: "12345",
                country: "ID",
            },
            line_items: lineItems,
            customer_note: `WA: ${customerInfo.wa || '-'} | Email: ${customerInfo.email} | Discord: ${customerInfo.discord || '-'} | Method: ${methodName} (${methodCode})`
        };

        const order = await createOrder(orderPayload);
        const orderTotal = Math.round(Number(order.total) || 0);

        // 4. Request Duitku Inquiry (Headless)
        const merchantOrderId = `YG-${order.id}-${Math.floor(1000 + Math.random() * 9000)}`;
        const productSummary = cartItems
            .map(i => i.name || "Item")
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
                email: customerInfo.email,
                phoneNumber: customerInfo.wa && customerInfo.wa !== "-" ? customerInfo.wa : "08123456789",
                customerVaName: customerInfo.name || "Yasui Buyer",
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
            console.error("Duitku Inquiry Failed:", duitkuError);
            throw new Error(`Gagal menghubungi gateway pembayaran Duitku: ${duitkuError.message}`);
        }

        // 5. Headless Order Pay URL (Langsung ke halaman Astro!)
        const paymentPayUrl = `/order-pay?id=${order.id}`;

        // 6. Generate Signed Session Token (Otomatis login 30 hari untuk pembeli)
        const userSession = generateSessionToken(customerInfo.email);

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
                email: customerInfo.email.trim().toLowerCase(),
                name: customerInfo.name || customerInfo.email.split("@")[0]
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
            paymentUrl: paymentPayUrl // Mengarah langsung ke /order-pay Astro!
        }), { status: 200 });

    } catch (error) {
        console.error("Create Order Error:", error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500 });
    }
};
