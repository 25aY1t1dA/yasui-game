/**
 * SKYARENA ORDER FULFILLMENT (alurnya terkonfirmasi dari JS bundle SkyArena)
 *
 * Alur saat order WooCommerce (kategori Summoners War) completed:
 *   1. buy/lock      -> kunci akun agar tidak diserobot reseller lain
 *   2. buy/sale      -> catat penjualan: {buyerName, platform:"Yasui Game", price:HARGA MODAL, currency:"USD", isPaid:true}
 *   3. set-account   -> start job -> poll awaiting_hive -> submit username/password pembeli
 *   4. buy/complete  -> tandai akun terjual final (rekap muncul di sales-history SkyArena)
 *
 * Harga yang dikirim ke SkyArena = HARGA MODAL (setoran_*), BUKAN harga jual.
 * Platform dikirim sebagai string "Yasui Game" (API menerima teks custom langsung).
 */

import { wcFetch } from "./wc.js";
import * as sky from "./skyarena.js";
import { ageBand } from "./skyarena-stock.js";
import { getPricesForMonster } from "./skyarena-pricelist.js";

export const SW_CATEGORY_SLUG = "summoners-war-sky-arena";
export const PLATFORM_LABEL = "Yasui Game"; // terekap di rekap SkyArena
export const SALE_CURRENCY = "USD";

/* ---------- Validasi kredensial pembeli (aturan owner) ---------- */
export function validateHiveUsername(u) {
    if (typeof u !== "string") return { ok: false, reason: "Username kosong" };
    if (u.length < 6 || u.length > 12) return { ok: false, reason: "Username harus 6-12 karakter" };
    if (!/^[A-Za-z0-9\-_.]+$/.test(u)) return { ok: false, reason: "Simbol hanya boleh - _ ." };
    return { ok: true };
}
export function validateHivePassword(p) {
    if (typeof p !== "string") return { ok: false, reason: "Password kosong" };
    if (p.length < 9) return { ok: false, reason: "Password minimal 9 karakter" };
    if (!/[0-9]/.test(p)) return { ok: false, reason: "Password wajib ada angka" };
    if (!/[^A-Za-z0-9]/.test(p)) return { ok: false, reason: "Password wajib ada simbol" };
    return { ok: true };
}

/* ---------- WooCommerce helpers ---------- */
let swCatId = null;
export async function getSwCategoryId() {
    if (swCatId) return swCatId;
    const d = await wcFetch("products/categories", { params: { slug: SW_CATEGORY_SLUG, per_page: 1 } });
    swCatId = Array.isArray(d) && d.length ? d[0].id : null;
    return swCatId;
}
export async function getCompletedSwOrders({ categoryId, perPage = 20, page = 1 } = {}) {
    const params = { status: "completed", per_page: perPage, page };
    if (categoryId) params.category = String(categoryId);
    const d = await wcFetch("orders", { params });
    return Array.isArray(d) ? d : [];
}
export async function updateOrderMeta(orderId, metaObj) {
    return wcFetch(`orders/${orderId}`, {
        method: "PUT",
        body: { meta_data: Object.entries(metaObj).map(([key, value]) => ({ key, value })) },
    });
}

/* ---------- Pemilihan akun kandidat ---------- */
/**
 * Cari akun SkyArena untuk sebuah item order.
 * tier: band_1_3 | band_4_7 | band_8_30 (blessing) | old
 */
export async function findCandidateAccount({ unitMasterId, region, tier = "old" }) {
    const isOld = tier === "old";
    const type = isOld ? "old" : "blessing";
    const d = await sky.getAccounts(type, {
        region, offset: 0, limit: 50,
        unitMasterIds: [unitMasterId], sortBy: "created_desc",
    });
    const accs = d.accounts || [];
    const now = new Date();
    const filtered = isOld ? accs : accs.filter((a) => ageBand(a, now) === tier);
    const free = filtered.filter((a) => a.isFreeHive !== false);
    return (free.length ? free : filtered)[0] || null;
}

/* ---------- Fulfillment utama ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Proses satu item order SW sampai selesai.
 * @param {object} args
 *   unitMasterId, region, tier ('band_1_3'|'band_4_7'|'band_8_30'|'old'),
 *   monsterName  -> untuk lookup harga modal (setoran) di price list
 *   buyerName    -> nama pembeli (dari order WooCommerce)
 *   hiveUsernames-> array opsi username [pilihan1, pilihan2, pilihan3]
 *   hivePassword -> password pembeli
 *   onStatus     -> callback(statusString)
 */
export async function fulfillSwAccount({
    unitMasterId, region, tier = "old", monsterName,
    buyerName, hiveUsernames, hivePassword,
    maxWaitMs = 5 * 60 * 1000,
    onStatus = () => {},
}) {
    // normalisasi username jadi array kandidat (coba berurutan)
    const usernameCandidates = (Array.isArray(hiveUsernames) ? hiveUsernames : [hiveUsernames]).filter(Boolean);
    if (!usernameCandidates.length) throw new Error("Minimal 1 opsi username diperlukan");
    for (const u of usernameCandidates) {
        const vu = validateHiveUsername(u);
        if (!vu.ok) throw new Error(`Username "${u}" tidak valid: ${vu.reason}`);
    }
    const vp = validateHivePassword(hivePassword);
    if (!vp.ok) throw new Error(`Password tidak valid: ${vp.reason}`);

    // harga modal (setoran) untuk rekap SkyArena
    const prices = monsterName ? getPricesForMonster(monsterName) : null;
    const costPrice = prices ? prices.setoran[tier] : null;

    // 1. cari kandidat yang available
    onStatus("mencari_akun");
    const candidate = await findCandidateAccount({ unitMasterId, region, tier });
    if (!candidate) throw new Error(`Tidak ada akun ${tier} untuk monster ${monsterName || unitMasterId} di ${region} — kemungkinan diserobot reseller lain.`);
    const uid = candidate.uid;
    onStatus(`akun_ditemukan uid=${uid}`);

    // 2. BUY-LOCK (amankan dari serobot)
    onStatus("buy_lock");
    await sky.buyLock(uid);

    let saleId = null;
    let locked = true;
    try {
        // 3. BUY/SALE — catat penjualan (harga modal, platform Yasui Game)
        onStatus("buy_sale");
        const sale = await sky.buySale(uid, {
            buyerName: (buyerName || "Pembeli Yasui").trim(),
            platform: PLATFORM_LABEL,
            price: Number.isFinite(costPrice) ? costPrice : 0,
            currency: SALE_CURRENCY,
            isPaid: true,
        });
        saleId = sale.saleId ?? sale.id ?? null;
        onStatus(`sale_tercatat saleId=${saleId}`);

        // 4. SET-ACCOUNT start
        onStatus("set_account_start");
        const start = await sky.startSetAccount(uid, saleId);
        const jobId = start.jobId;
        if (typeof jobId !== "number") throw new Error("SkyArena tidak mengembalikan jobId");

        // 5. tunggu awaiting_hive
        onStatus("menunggu_awaiting_hive");
        const deadline = Date.now() + maxWaitMs;
        if (saleId) {
            while (Date.now() < deadline) {
                try {
                    const st = await sky.getSetAccountJobStatus(saleId);
                    if (st.jobStatus === "awaiting_hive") break;
                    if (st.jobStatus === "failed" || st.jobStatus === "cancelled") throw new Error(`Job ${st.jobStatus}: ${st.errorDetail || ""}`);
                } catch (e) { if (/Job (failed|cancelled)/.test(e.message)) throw e; }
                await sleep(3000);
            }
        }

        // 6. submit kredensial — coba tiap opsi username sampai ada yang diterima
        onStatus("submit_hive");
        let submitted = null;
        let lastErr = null;
        for (const uname of usernameCandidates) {
            try {
                await sky.submitHiveCredentials(jobId, { hiveUsername: uname, hivePassword, saleId });
                submitted = uname;
                break;
            } catch (e) { lastErr = e; onStatus(`username_ditolak:${uname}`); }
        }
        if (!submitted) throw new Error(`Semua opsi username ditolak. Terakhir: ${lastErr ? lastErr.message : "-"}`);

        // 7. tunggu completed
        onStatus("menunggu_completed");
        if (saleId) {
            while (Date.now() < deadline) {
                const st = await sky.getSetAccountJobStatus(saleId).catch(() => null);
                if (st) {
                    if (st.jobStatus === "completed") break;
                    if (st.jobStatus === "failed" || st.jobStatus === "cancelled") throw new Error(`Set-account ${st.jobStatus}: ${st.errorDetail || ""}`);
                }
                await sleep(4000);
            }
        }

        // 8. BUY/COMPLETE — tandai terjual final
        onStatus("buy_complete");
        await sky.buyComplete(uid, saleId).catch(() => {}); // 409 = sudah, abaikan

        onStatus("selesai");
        return { success: true, uid, saleId, jobId, hiveUsername: submitted, costPrice, platform: PLATFORM_LABEL };
    } catch (err) {
        // gagal di tengah: lepas lock agar akun tidak nyangkut (kecuali sudah complete)
        if (locked) { try { await sky.buyUnlock(uid); } catch {} }
        throw err;
    }
}
