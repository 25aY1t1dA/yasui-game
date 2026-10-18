import { updateCustomerPassword, findOrCreateCustomer, wcFetch, generateSessionToken, verifySessionToken, authenticateCustomer, getOrder } from '../../../lib/wc.js';
import { isValidEmail } from '../../../lib/sanitize.js';

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        const { email, password, customerId, oldPassword, orderId, orderKey } = body;

        // 1. Validasi Input Dasar
        if (!email || !isValidEmail(email)) {
            return new Response(JSON.stringify({
                success: false,
                error: "Alamat email tidak valid atau kosong."
            }), { status: 400 });
        }

        if (!password || typeof password !== "string" || password.length < 6 || password.length > 128) {
            return new Response(JSON.stringify({
                success: false,
                error: "Kata sandi minimal harus 6 karakter dan maksimal 128 karakter."
            }), { status: 400 });
        }

        const cleanEmail = email.trim().toLowerCase();

        // 2. Verifikasi Autentikasi Keamanan (Mencegah Account Takeover)
        const authHeader = request.headers.get("Authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim() || body.token;

        let isAuthorized = false;
        let authReason = "";

        // Metode A: Validasi via Signed Session Token Pelanggan
        if (token && verifySessionToken(token, cleanEmail)) {
            isAuthorized = true;
            authReason = "session_token";
        }

        // Metode B: Validasi via Kata Sandi Lama
        if (!isAuthorized && oldPassword) {
            const isOldValid = await authenticateCustomer(cleanEmail, oldPassword);
            if (isOldValid) {
                isAuthorized = true;
                authReason = "old_password";
            }
        }

        // Metode C: Validasi via Verifikasi Pesanan Baru (Halaman order-success setelah bayar)
        if (!isAuthorized && orderId && orderKey) {
            try {
                const verifiedOrder = await getOrder(parseInt(orderId, 10));
                if (
                    verifiedOrder &&
                    verifiedOrder.order_key === orderKey &&
                    (verifiedOrder.billing?.email || "").trim().toLowerCase() === cleanEmail
                ) {
                    isAuthorized = true;
                    authReason = "order_key_verification";
                }
            } catch (e) {
                console.warn("[Set-Password Order Verify Warn]:", e.message);
            }
        }

        // Jika tidak ada satu pun metode verifikasi yang sah, tolak akses!
        if (!isAuthorized) {
            return new Response(JSON.stringify({
                success: false,
                error: "Akses ditolak. Untuk memasang atau memperbarui kata sandi, mohon login terlebih dahulu atau gunakan sesi pemesanan yang sah."
            }), { status: 401 });
        }

        // 3. Resolusi Customer ID di WooCommerce
        let targetId = customerId ? parseInt(customerId, 10) : null;

        if (!targetId) {
            const customerList = await wcFetch("customers", {
                params: { email: cleanEmail, role: "all", per_page: 1 },
                bypassCache: true
            });
            if (customerList && customerList.length > 0) {
                targetId = customerList[0].id;
            } else {
                // Buatkan customer jika baru pertama kali beli
                const created = await findOrCreateCustomer({ email: cleanEmail });
                if (created && created.id) {
                    targetId = created.id;
                }
            }
        }

        if (!targetId) {
            return new Response(JSON.stringify({
                success: false,
                error: "Akun pelanggan tidak ditemukan di sistem WooCommerce."
            }), { status: 404 });
        }

        // 4. Simpan kata sandi baru ke WooCommerce
        await updateCustomerPassword(targetId, password);

        // 5. Terbitkan session token HMAC-SHA256 baru
        const sessionInfo = generateSessionToken(cleanEmail);

        return new Response(JSON.stringify({
            success: true,
            message: "Kata sandi akun Anda berhasil diperbarui dengan aman!",
            authMethod: authReason,
            user: {
                id: targetId,
                email: cleanEmail,
                name: cleanEmail.split('@')[0],
            },
            session: {
                token: sessionInfo.token,
                expiresAt: sessionInfo.expiresAt,
            }
        }), { status: 200 });

    } catch (error) {
        console.error("Set Password API Error:", error.message);
        return new Response(JSON.stringify({
            success: false,
            error: "Gagal memperbarui kata sandi akun. Silakan coba kembali."
        }), { status: 500 });
    }
};
