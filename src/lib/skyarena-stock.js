/**
 * SkyArena -> WooCommerce Stock Sync
 *
 * KOREKSI PEMETAAN (dari owner):
 *  - FRESH  = kategori BLESSING (/api/accounts/blessing), akun berumur 0-30 hari
 *  - TUA    = kategori OLD      (/api/accounts/old),      akun berumur >= 30 hari
 *  - SCROLL = kategori terpisah, dikerjakan paling akhir (sudah ada user/pass)
 *
 * Definisi "fresh" Yasui = umur <= FRESH_MAX_DAYS (default 7) dari createdServerDate.
 * Di dalam kategori blessing, harga bertingkat per rentang umur:
 *   band_1_3   : hari 1-3   (harga tertinggi, misal Lucifer $40)
 *   band_4_7   : hari 4-7   (misal $39)
 *   band_8_30  : hari 8-30  (flat, misal $38)
 *   old        : >= 30 hari (harga flat terpisah)
 * Umur dihitung dari account.createdServerDate (fallback createdKoreanTime).
 */

import { wcFetch } from "./wc.js";
import * as sky from "./skyarena.js";

export const FRESH_MAX_DAYS = Number(process.env.SKYARENA_FRESH_MAX_DAYS || 7);
export const SW_CATEGORY_SLUG = "summoners-war-sky-arena";

/** Rentang umur untuk tier harga blessing. */
export const AGE_BANDS = [
    { key: "band_1_3", label: "Hari 1-3", min: 0, max: 3 },
    { key: "band_4_7", label: "Hari 4-7", min: 4, max: 7 },
    { key: "band_8_30", label: "Hari 8-30", min: 8, max: 30 },
];

/** Umur akun dalam hari (dari createdServerDate, fallback createdKoreanTime). */
export function accountAgeDays(acc, now = new Date()) {
    const raw = acc.createdServerDate || (acc.createdKoreanTime ? acc.createdKoreanTime.slice(0, 10) : null);
    if (!raw) return null;
    const created = new Date(raw + "T00:00:00Z");
    if (isNaN(created)) return null;
    return Math.max(0, Math.floor((now - created) / 86400000));
}

export function isFresh(acc, now = new Date()) {
    const age = accountAgeDays(acc, now);
    return age !== null && age <= FRESH_MAX_DAYS;
}

/** Tentukan band umur blessing (band_1_3|band_4_7|band_8_30) atau null bila >30. */
export function ageBand(acc, now = new Date()) {
    const age = accountAgeDays(acc, now);
    if (age === null) return null;
    const band = AGE_BANDS.find((b) => age >= b.min && age <= b.max);
    return band ? band.key : null; // null => > 30 hari => masuk kategori old
}

/**
 * Ringkasan stok per monster (LD nat5) per region untuk kategori BLESSING.
 * Return: { "<unitMasterId>": { region: { band_1_3:n, band_4_7:n, band_8_30:n } } }
 */
export async function buildBlessingSnapshot({ regions = sky.REGIONS, onProgress = () => {} } = {}) {
    return buildSnapshotFor("blessing", (acc, now, bucket) => {
        const b = ageBand(acc, now);
        if (b) bucket[b] = (bucket[b] || 0) + 1;
    }, { regions, onProgress });
}

/**
 * Ringkasan stok per monster per region untuk kategori OLD (semua >=30 hari, flat).
 * Return: { "<unitMasterId>": { region: { old:n } } }
 */
export async function buildOldSnapshot({ regions = sky.REGIONS, onProgress = () => {} } = {}) {
    return buildSnapshotFor("old", (acc, now, bucket) => {
        bucket.old = (bucket.old || 0) + 1;
    }, { regions, onProgress });
}

async function buildSnapshotFor(type, accumulate, { regions, onProgress }) {
    const snapshot = {};
    for (const region of regions) {
        onProgress(`Mengambil akun ${type} region ${region}...`);
        const accs = await sky.getAllAccounts(type, { region, pageSize: 100 });
        const now = new Date();
        for (const acc of accs) {
            const ids = new Set(
                (acc.monsters || [])
                    .filter((m) => (m.element === "Light" || m.element === "Dark") && m.naturalStars === 5)
                    .map((m) => String(m.unitMasterId))
            );
            for (const id of ids) {
                snapshot[id] = snapshot[id] || {};
                snapshot[id][region] = snapshot[id][region] || {};
                accumulate(acc, now, snapshot[id][region]);
            }
        }
        onProgress(`  ${type}/${region}: ${accs.length} akun.`);
    }
    return snapshot;
}

/* ---------- WooCommerce ---------- */
export async function findProductBySku(sku) {
    const d = await wcFetch("products", { params: { sku, per_page: 1 } });
    return Array.isArray(d) && d.length ? d[0] : null;
}

export async function setProductStock(productId, { stockQuantity, inStock }) {
    return wcFetch(`products/${productId}`, {
        method: "PUT",
        body: {
            manage_stock: true,
            stock_quantity: stockQuantity,
            stock_status: inStock ? "instock" : "outofstock",
        },
    });
}

/**
 * SKU kanonik produk SW.
 *   blessing: sw-<umid>-<region>-b13 | b47 | b830   (per band umur)
 *   old     : sw-<umid>-<region>-old
 */
export function makeSku({ unitMasterId, region, tier = "old" }) {
    return `sw-${String(unitMasterId).toLowerCase()}-${region.toLowerCase()}-${tier}`;
}
