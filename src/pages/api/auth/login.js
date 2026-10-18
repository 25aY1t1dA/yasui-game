import { authenticateCustomer, wcFetch, findOrCreateCustomer, generateSessionToken } from '../../../lib/wc.js';

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !email.includes('@')) {
            return new Response(JSON.stringify({
                success: false,
                error: "Alamat email wajib diisi dan harus valid."
            }), { status: 400 });
        }

        if (!password) {
            return new Response(JSON.stringify({
                success: false,
                error: "Kata sandi wajib diisi untuk masuk ke akun Anda."
            }), { status: 400 });
        }

        const cleanEmail = email.trim().toLowerCase();

        // 1. Verifikasi kredensial langsung ke WordPress Engine
        const isValid = await authenticateCustomer(cleanEmail, password);
        if (!isValid) {
            return new Response(JSON.stringify({
                success: false,
                error: "Email atau kata sandi salah. Silakan periksa kembali."
            }), { status: 401 });
        }

        // 2. Ambil data customer dari WooCommerce
        let customer = null;
        try {
            const customerList = await wcFetch("customers", {
                params: { email: cleanEmail, role: "all", per_page: 1 }
            });
            if (customerList && customerList.length > 0) {
                customer = customerList[0];
            } else {
                customer = await findOrCreateCustomer({ email: cleanEmail });
            }
        } catch (e) {
            console.warn("Auth get customer warning:", e.message);
        }

        const userData = {
            id: customer?.id || 0,
            email: cleanEmail,
            name: customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.username : cleanEmail.split('@')[0],
            username: customer?.username || cleanEmail.split('@')[0],
            avatar: customer?.avatar_url || null,
        };

        // 3. Buat token sesi HMAC-SHA256 30 hari
        const sessionInfo = generateSessionToken(cleanEmail);

        return new Response(JSON.stringify({
            success: true,
            user: userData,
            session: {
                token: sessionInfo.token,
                expiresAt: sessionInfo.expiresAt,
            }
        }), { status: 200 });

    } catch (error) {
        console.error("Auth Login API Error:", error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Terjadi kesalahan pada server saat login."
        }), { status: 500 });
    }
};
