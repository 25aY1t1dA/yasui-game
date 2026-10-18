/**
 * POST /api/sw/set-account
 * Terima kredensial Hive dari pembeli untuk order SW (SKU prefix sw-),
 * simpan ke order meta, lalu trigger fulfillment SkyArena (fulfillSwAccount).
 * Body: { orderId, token|email+password, usernames:[u1,u2,u3], password }
 */
import { wcFetch, verifySessionToken, authenticateCustomer } from "../../../../lib/wc.js";
import { validateHiveUsername, validateHivePassword } from "../../../../lib/skyarena-fulfill.js";
import { fulfillSwAccount } from "../../../../lib/skyarena-fulfill.js";

/** Ekstrak {unitMasterId, region, tier} dari SKU sw-<umid>-<region>-<tier> */
function parseSwSku(sku) {
    if (!sku || !sku.startsWith("sw-")) return null;
    const parts = sku.split("-");
    if (parts.length < 4) return null;
    const tier = parts.pop();
    if (!["b13", "b47", "b830", "old"].includes(tier)) return null;
    const region = parts.pop()?.toUpperCase();
    if (!["ASIA", "GLOBAL", "EUROPA"].includes(region)) return null;
    const unitMasterId = parts.slice(1).join("-");
    return { unitMasterId, region, tier };
}

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        const { orderId, usernames, password: hivePassword } = body || {};
        const email = (body.email || "").trim().toLowerCase();

        if (!orderId || !Array.isArray(usernames) || !hivePassword) {
            return json(400, { success: false, error: "Data tidak lengkap (orderId, usernames, password)." });
        }

        // --- Auth: sama dengan pola /api/user/orders ---
        const authHeader = request.headers.get("Authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim() || body.token;
        const isTokenValid = token && verifySessionToken(token, email);
        let isPasswordValid = false;
        if (!isTokenValid && body.password) {
            // NOTE: body.password dipakai dua makna; jika payload memakai 'password' untuk Hive,
            // auth password akun tidak tersedia di payload ini — token wajib.
            isPasswordValid = false;
        }
        if (!isTokenValid) {
            return json(401, { success: false, error: "Sesi tidak valid. Silakan login ulang." });
        }

        // --- Ambil order & validasi kepemilikan ---
        const order = await wcFetch(`orders/${parseInt(orderId, 10)}`);
        if (!order || !order.id) return json(404, { success: false, error: "Order tidak ditemukan." });
        const orderEmail = (order.billing?.email || "").toLowerCase();
        if (orderEmail !== email) {
            return json(403, { success: false, error: "Order ini bukan milik akun Anda." });
        }
        if (order.status !== "completed") {
            return json(400, { success: false, error: "Order belum dibayar penuh — set akun hanya untuk order completed." });
        }

        // --- Cegah double-submit ---
        const existing = (order.meta_data || []).find((m) => m.key === "_sw_set_account");
        if (existing && ["processing", "completed"].includes(existing.value?.status)) {
            return json(409, { success: false, error: "Set akun sudah berjalan atau selesai untuk order ini." });
        }

        // --- Validasi kredensial (client juga validasi, ini double-check server) ---
        const cleanUsernames = usernames.map((u) => String(u || "").trim()).filter(Boolean);
        if (cleanUsernames.length < 1) return json(400, { success: false, error: "Minimal 1 username Hive." });
        for (const u of cleanUsernames) {
            const v = validateHiveUsername(u);
            if (!v.ok) return json(400, { success: false, error: `Username "${u}" tidak valid: ${v.reason}` });
        }
        const vp = validateHivePassword(hivePassword);
        if (!vp.ok) return json(400, { success: false, error: `Password tidak valid: ${vp.reason}` });

        // --- Parse produk SW dari line items ---
        const swItems = [];
        for (const item of order.line_items || []) {
            const parsed = parseSwSku(item.sku);
            if (parsed) swItems.push({ ...parsed, productId: item.product_id, name: item.name, qty: item.quantity });
        }
        if (swItems.length === 0) {
            return json(400, { success: false, error: "Tidak ada produk akun Summoners War di order ini." });
        }

        // --- Simpan status awal ke order meta ---
        const metaPayload = {
            status: "processing",
            submittedAt: new Date().toISOString(),
            usernames: cleanUsernames,
            items: swItems.map((s) => ({ sku: `sw-${s.unitMasterId}-${s.region.toLowerCase()}-${s.tier}`, name: s.name })),
        };
        await upsertOrderMeta(order.id, "_sw_set_account", metaPayload);

        // --- Trigger fulfillment (async, jangan blokir response) ---
        const results = [];
        const buyerName = [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(" ") || email;
        // Jalankan fulfillment di background; status di-update bertahap via onStatus
        (async () => {
            for (const sw of swItems) {
                try {
                    await fulfillSwAccount({
                        unitMasterId: sw.unitMasterId,
                        region: sw.region,
                        tier: sw.tier,
                        monsterName: extractMonsterName(sw.name),
                        buyerName,
                        hiveUsernames: cleanUsernames,
                        hivePassword,
                        onStatus: (s) => {
                            // update meta tiap perubahan status signifikan
                            metaPayload.status = "processing";
                            metaPayload.lastStatus = s;
                            upsertOrderMeta(order.id, "_sw_set_account", { ...metaPayload }).catch(() => {});
                        },
                    });
                    metaPayload.status = "completed";
                    metaPayload.completedAt = new Date().toISOString();
                    metaPayload.finalUsername = cleanUsernames[0]; // diset ulang di bawah bila backend beri info
                } catch (e) {
                    metaPayload.status = "failed";
                    metaPayload.error = String(e.message || e).slice(0, 300);
                    metaPayload.failedAt = new Date().toISOString();
                }
                await upsertOrderMeta(order.id, "_sw_set_account", { ...metaPayload }).catch(() => {});
            }
        })().catch(() => {});

        // Respons langsung: fulfillment berjalan di background
        return json(202, {
            success: true,
            message: "Set akun dimulai. Cek status berkala di halaman pesanan.",
            orderId: order.id,
            itemsCount: swItems.length,
        });
    } catch (error) {
        console.error("SW set-account error:", error);
        return json(500, { success: false, error: "Kesalahan server saat memproses set akun." });
    }
};

/** GET-like status di file terpisah; helper di sini */
async function upsertOrderMeta(orderId, key, value) {
    try {
        await wcFetch(`orders/${orderId}`, { method: "PUT", body: { meta_data: [{ key, value }] } });
    } catch (e) {
        console.warn("upsertOrderMeta gagal:", e.message);
    }
}

function extractMonsterName(productName) {
    // "Lucifer (Light) — ASIA — Fresh 1-3 Hari" -> "Lucifer"
    return productName?.split("(")[0]?.trim() || null;
}

function json(status, obj) {
    return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
