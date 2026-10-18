import { updateCustomerPassword, findOrCreateCustomer, wcFetch, generateSessionToken } from '../../../lib/wc.js';

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        const { email, password, customerId } = body;

        if (!password || password.length < 6) {
            return new Response(JSON.stringify({
                success: false,
                error: "Kata sandi minimal harus 6 karakter."
            }), { status: 400 });
        }

        if (!email && !customerId) {
            return new Response(JSON.stringify({
                success: false,
                error: "Email atau Customer ID dibutuhkan."
            }), { status: 400 });
        }

        let targetId = customerId;
        const cleanEmail = (email || "").trim().toLowerCase();

        // Jika ID belum ada, cari berdasarkan email
        if (!targetId && cleanEmail) {
            const customerList = await wcFetch("customers", {
                params: { email: cleanEmail, role: "all", per_page: 1 }
            });
            if (customerList && customerList.length > 0) {
                targetId = customerList[0].id;
            } else {
                // Buatkan customer jika belum ada
                const created = await findOrCreateCustomer({ email: cleanEmail });
                if (created && created.id) {
                    targetId = created.id;
                }
            }
        }

        if (!targetId) {
            return new Response(JSON.stringify({
                success: false,
                error: "Akun pelanggan tidak ditemukan di WooCommerce."
            }), { status: 404 });
        }

        // Simpan kata sandi baru ke WooCommerce
        await updateCustomerPassword(targetId, password);

        // Buat token sesi aktif
        const sessionInfo = generateSessionToken(cleanEmail);

        return new Response(JSON.stringify({
            success: true,
            message: "Kata sandi akun Anda berhasil diperbarui!",
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
        console.error("Set Password API Error:", error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Gagal memperbarui kata sandi."
        }), { status: 500 });
    }
};
