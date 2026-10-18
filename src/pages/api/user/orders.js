import { wcFetch, findOrCreateCustomer, WP_URL, verifySessionToken, authenticateCustomer } from '../../../lib/wc.js';

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !email.includes("@")) {
            return new Response(JSON.stringify({
                success: false,
                error: "Email tidak valid. Mohon masukkan email Anda."
            }), { status: 400 });
        }

        const cleanEmail = email.trim().toLowerCase();

        // Verifikasi Autentikasi Keamanan:
        // Cek Authorization header Bearer token atau body.token
        const authHeader = request.headers.get("Authorization") || "";
        const tokenFromHeader = authHeader.replace(/^Bearer\s+/i, "").trim();
        const token = tokenFromHeader || body.token;

        const isTokenValid = verifySessionToken(token, cleanEmail);
        let isPasswordValid = false;

        if (!isTokenValid && password) {
            isPasswordValid = await authenticateCustomer(cleanEmail, password);
        }

        if (!isTokenValid && !isPasswordValid) {
            return new Response(JSON.stringify({
                success: false,
                error: "Akses ditolak. Silakan masuk dengan kata sandi akun Anda untuk mengakses riwayat pesanan."
            }), { status: 401 });
        }

        // 1. Cek profil customer jika ada
        let customer = null;
        try {
            const customerList = await wcFetch("customers", {
                params: { email: cleanEmail, role: "all", per_page: 1 }
            });
            if (customerList && customerList.length > 0) {
                customer = customerList[0];
            }
        } catch (e) {
            console.warn("Check customer in orders API warning:", e.message);
        }

        // 2. Ambil pesanan: cari via search email DAN via customer ID
        let ordersMap = new Map();

        // A. Ambil via search email (mencakup guest orders lama & baru)
        try {
            const searchOrders = await wcFetch("orders", {
                params: { search: cleanEmail, per_page: 50 }
            });
            if (Array.isArray(searchOrders)) {
                searchOrders.forEach(o => {
                    // Verifikasi bahwa billing email memang cocok
                    if (o.billing?.email?.toLowerCase() === cleanEmail || o.customer_note?.toLowerCase().includes(cleanEmail)) {
                        ordersMap.set(o.id, o);
                    }
                });
            }
        } catch (e) {
            console.warn("Search orders by email warning:", e.message);
        }

        // B. Ambil via customer_id jika customer terdaftar
        if (customer && customer.id) {
            try {
                const customerOrders = await wcFetch("orders", {
                    params: { customer: customer.id, per_page: 50 }
                });
                if (Array.isArray(customerOrders)) {
                    customerOrders.forEach(o => {
                        ordersMap.set(o.id, o);
                    });
                }
            } catch (e) {
                console.warn("Search orders by customer id warning:", e.message);
            }
        }

        // 3. Format pesanan agar bersih dan siap ditampilkan di frontend
        const allOrders = Array.from(ordersMap.values()).sort((a, b) => {
            return new Date(b.date_created).getTime() - new Date(a.date_created).getTime();
        });

        const formattedOrders = allOrders.map(order => {
            const isPending = order.status === "pending" || order.status === "on-hold";

            // Perhitungan kadaluarsa (15 Menit)
            const orderCreatedMs = new Date(order.date_created).getTime();
            const expiryMeta = (order.meta_data || []).find(m => m.key === "_duitku_expiry_time");
            const expiryTimeMs = expiryMeta ? Number(expiryMeta.value) : (orderCreatedMs + 15 * 60 * 1000);

            const isExpired = isPending && (Date.now() >= expiryTimeMs);
            const remainingSeconds = isPending ? Math.max(0, Math.floor((expiryTimeMs - Date.now()) / 1000)) : 0;
            const effectiveStatus = isExpired ? "cancelled" : order.status;

            const paymentUrl = `/order-pay?id=${order.id}`;

            return {
                id: order.id,
                number: order.number || order.id,
                status: effectiveStatus,
                originalStatus: order.status,
                isExpired,
                remainingSeconds,
                dateCreated: order.date_created,
                datePaid: order.date_paid,
                total: order.total,
                currency: order.currency || "IDR",
                currencySymbol: order.currency_symbol || "Rp",
                paymentMethodTitle: order.payment_method_title || "Duitku Payment Gateway",
                paymentUrl: paymentUrl,
                customerNote: order.customer_note || "",
                items: (order.line_items || []).map(item => ({
                    id: item.id,
                    productId: item.product_id,
                    sku: item.sku || null,
                    name: item.name || "Akun Game / Voucher",
                    quantity: item.quantity,
                    price: item.price,
                    total: item.total,
                    image: item.image?.src || null
                })),
                metaData: order.meta_data || []
            };
        });

        return new Response(JSON.stringify({
            success: true,
            email: cleanEmail,
            customer: customer ? {
                id: customer.id,
                name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || customer.username,
                username: customer.username,
                email: customer.email,
                avatar: customer.avatar_url
            } : null,
            totalOrders: formattedOrders.length,
            orders: formattedOrders
        }), { status: 200 });

    } catch (error) {
        console.error("Fetch User Orders Error:", error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500 });
    }
};
