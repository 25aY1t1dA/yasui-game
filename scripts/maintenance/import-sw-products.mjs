/**
 * IMPORT PRODUK SUMMONERS WAR ke WooCommerce
 *
 * Sumber data : scripts/maintenance/sw-products.json  (2.196 kombinasi monster×region×tier)
 * Harga       : src/lib/skyarena-pricelist.js (price_* = harga jual; skip tanpa harga)
 * Deskripsi   : src/lib/skyarena-description.js (buildDescription/buildShortDescription)
 * Foto        : public/assets/SW_Monster/<Nama>.png + alias typo
 *               (root = foto monster; folder Eldorado/ = varian — TIDAK dipakai saat ini)
 * Fallback    : swarfarm icon via img-proxy bila screenshot tidak ada
 *
 * Idempoten: cek by SKU dulu → update (harga/stok/deskripsi) atau create.
 * Stok: hanya stok>0 yang di-publish; stok 0 juga dibuat (status outofstock, tetap tampil utk SEO)
 *       — tapi untuk menjaga katalog bersih, produk stok 0 TIDAK diimport kecuali flag --include-empty.
 *
 * Jalankan: node --env-file=.env scripts/maintenance/import-sw-products.mjs [--limit=N] [--dry-run] [--include-empty]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wcFetch } from "../../src/lib/wc.js";
import { getPricesForMonster } from "../../src/lib/skyarena-pricelist.js";
import { buildDescription, buildShortDescription } from "../../src/lib/skyarena-description.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const INCLUDE_EMPTY = args.includes("--include-empty");
const LIMIT = (() => { const m = args.find(a => a.startsWith("--limit=")); return m ? Number(m.split("=")[1]) : null; })();

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "sw-products.json"), "utf8"));
const SHOT_DIR = path.join(__dirname, "../../public/assets/SW_Monster");

// --- Mapping nama monster -> file screenshot (termasuk alias typo di folder owner) ---
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const SHOTS = fs.existsSync(SHOT_DIR)
    ? fs.readdirSync(SHOT_DIR).filter(f => f.toLowerCase().endsWith(".png"))
    : [];
// alias: key=norm(monsterName dgn elemen), value=filename asli
const ALIAS = {
    // elemen-prefixed (owner menamai file per varian elemen)
    ...(Object.fromEntries(SHOTS.filter(f => /^(Dark|Light) /i.test(f)).map(f => {
        const m = f.replace(/\.png$/i, "").match(/^(Dark|Light) (.+)$/i);
        return [norm(`${m[2]} ${m[1]}`), f];
    }))),
    // typo / beda format
    [norm("Azure Dragon Swordsman")]: "Azure Dragon Swordman.png",
    [norm("Manannan")]: "Mannanan.png",
    [norm("Son Zhang Lao")]: "Son Zang Lao.png",
    [norm("Vancliffe")]: "Vanclife.png",
    [norm("Jessica")]: "Jessice.png",
};
const shotFor = (monsterName, element) => {
    const a = ALIAS[norm(monsterName)] || ALIAS[norm(`${monsterName} ${element}`)];
    if (a) return a;
    const direct = SHOTS.find(f => norm(f.replace(/\.png$/i, "")) === norm(monsterName));
    return direct || null;
};

// kategori id
let swCatId = null;
{
    const cats = await wcFetch("products/categories", { params: { slug: "summoners-war-sky-arena", per_page: 1, hide_empty: false } });
    swCatId = cats[0]?.id;
    if (!swCatId) throw new Error("Kategori summoners-war-sky-arena tidak ditemukan");
    const akun = await wcFetch("products/categories", { params: { slug: "sw-akun", per_page: 1, hide_empty: false } });
    if (akun[0]?.id) swCatId = [swCatId, akun[0].id];
}

// tier -> attribute Age Band option
const TIER_BAND = { band_1_3: "Fresh (1-3 Days)", band_4_7: "Fresh (4-7 Days)", band_8_30: "Fresh (8-30 Days)", old: "Old" };
const REGION_LABEL = { ASIA: "Asia", GLOBAL: "Global", EUROPA: "Europe" };

const mediaCache = new Map(); // imageFilename -> mediaId
const localShotCache = new Map(); // filename -> mediaId
let created = 0, updated = 0, skipped = 0, failed = 0;
let products = DATA.products.filter(p => {
    if (!INCLUDE_EMPTY && p.stock <= 0) return false;
    const pr = getPricesForMonster(p.monster_name);
    if (!pr || !Number.isFinite(pr.price[p.tier])) return false; // kolaborasi tanpa harga: skip
    return true;
});
// urutkan: stok>0 dulu
products.sort((a, b) => b.stock - a.stock);
if (LIMIT) products = products.slice(0, LIMIT);

console.log(`Import ${products.length} produk SW (dry-run=${DRY}, include-empty=${INCLUDE_EMPTY})`);

for (const p of products) {
    const prices = getPricesForMonster(p.monster_name);
    if (!prices) { skipped++; continue; } // kolaborasi tanpa harga: skip
    const price = prices.price[p.tier];
    if (!Number.isFinite(price) || price <= 0) { skipped++; continue; }

    // foto: convert harga USD -> IDR? Harga di CSV USD; konversi di luar (owner set kurs). Sementara pakai nilai × 16500 (bisa diubah env SW_USD_RATE)
    const rate = Number(process.env.SW_USD_RATE || 16500);
    const idr = Math.round(price * rate / 100) * 100; // bulatkan ke ratusan

    const shot = shotFor(p.monster_name, p.element);
    const imageSrc = shot
        ? `/assets/SW_Monster/${encodeURIComponent(shot)}`  // lokal (public/)
        : null; // fallback swarfarm -> diupload ke WP Media (bukan via /img-proxy, WC tak bisa fetch route internal)

    const description = buildDescription({
        monsterName: p.monster_name, element: p.element, region: p.region, tier: p.tier,
        naturalStars: p.natural_stars, accountCount: p.stock,
    });
    const shortDescription = buildShortDescription({
        monsterName: p.monster_name, element: p.element, region: p.region, tier: p.tier,
        naturalStars: p.natural_stars,
    });

    const payload = {
        name: `${p.monster_name} (${p.element}) — ${p.region} — ${tierLabel(p.tier)}`,
        type: "simple",
        regular_price: String(idr),
        description,
        short_description: shortDescription,
        categories: Array.isArray(swCatId) ? swCatId.map(id => ({ id })) : [{ id: swCatId }],
        sku: p.sku,
        stock_quantity: p.stock,
        stock_status: p.stock > 0 ? "instock" : "outofstock",
        manage_stock: true,
        attributes: [
            { name: "Server", options: [REGION_LABEL[p.region]], visible: true, variation: false },
            { name: "Age Band", options: [TIER_BAND[p.tier]], visible: true, variation: false },
            { name: "Element", options: [p.element], visible: true, variation: false },
        ],
        meta_data: [
            { key: "_yasui_sw_unit_master_id", value: String(p.unit_master_id) },
            { key: "_yasui_sw_region", value: p.region },
            { key: "_yasui_sw_tier", value: p.tier },
            { key: "_yasui_sw_usd_price", value: price },
        ],
    };
    if (imageSrc) payload.meta_data.push({ key: "_yasui_sw_local_image", value: imageSrc });

    try {
        // cek existing by SKU
        const existing = await wcFetch("products", { params: { sku: p.sku, per_page: 1, status: "any" } });
        if (DRY) {
            console.log(`[DRY] ${p.sku} ${existing.length ? "UPDATE" : "CREATE"} | Rp ${idr.toLocaleString("id-ID")} | stok ${p.stock} | foto: ${shot || "swarfarm-fallback"}`);
            continue;
        }
        if (existing.length) {
            // foto hanya diset saat create (biar tidak menimpa customisasi)
            await wcFetch(`products/${existing[0].id}`, { method: "PUT", body: payload });
            updated++;
        } else {
            // foto: screenshot lokal (upload ke WP Media) dulu, fallback swarfarm icon
            if (imageSrc) {
                const mediaId = await uploadLocalShot(shot, `${p.monster_name} ${p.element}`);
                if (mediaId) payload.images = [{ id: mediaId }];
            } else if (p.image_filename) {
                const mediaId = await uploadSwarfarmIcon(p.image_filename, `${p.monster_name} ${p.element}`);
                if (mediaId) payload.images = [{ id: mediaId }];
            }
            await wcFetch("products", { method: "POST", body: payload });
            created++;
        }
        process.stdout.write(`\r✓ ${created + updated}/${products.length}`);
    } catch (e) {
        failed++;
        console.error(`\n✗ ${p.sku}: ${e.message?.slice(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 250));
}

console.log(`\n\nSelesai: create=${created} update=${updated} skip(tanpa harga)=${skipped} gagal=${failed}`);
console.log(`Total sumber: ${DATA.products.length} (stok>0: ${DATA.products.filter(x => x.stock > 0).length})`);
console.log("Foto lokal dipakai:", shotFor ? "ya (root + alias)" : "n/a");

async function uploadLocalShot(filename, altText) {
    if (localShotCache.has(filename)) return localShotCache.get(filename);
    try {
        const { WP_URL } = await import("../src/lib/wc.js");
        const wpAuth = "Basic " + Buffer.from(`${process.env.WP_APP_USER}:${process.env.WP_APP_PASSWORD}`).toString("base64");
        const buf = fs.readFileSync(path.join(SHOT_DIR, filename));
        const form = new FormData();
        form.append("file", new Blob([buf], { type: "image/png" }), `sw-shot-${filename.replace(/\s+/g, "-")}`);
        const up = await fetch(`${WP_URL.replace(/\/+$/, "")}/wp-json/wp/v2/media`, { method: "POST", headers: { Authorization: wpAuth }, body: form });
        if (!up.ok) throw new Error(`upload ${up.status}`);
        const media = await up.json();
        localShotCache.set(filename, media.id);
        return media.id;
    } catch (e) {
        console.warn(`\n⚠ upload screenshot lokal gagal (${filename}): ${e.message?.slice(0, 60)}`);
        localShotCache.set(filename, null);
        return null;
    }
}

async function uploadSwarfarmIcon(imageFilename, altText) {
    if (mediaCache.has(imageFilename)) return mediaCache.get(imageFilename);
    try {
        const url = `https://swarfarm.com/static/herders/images/monsters/${imageFilename}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const { WP_URL } = await import("../src/lib/wc.js");
        const wpAuth = "Basic " + Buffer.from(`${process.env.WP_APP_USER}:${process.env.WP_APP_PASSWORD}`).toString("base64");
        const form = new FormData();
        form.append("file", new Blob([buf], { type: "image/png" }), `sw-monster-${imageFilename}`);
        const up = await fetch(`${WP_URL.replace(/\/+$/, "")}/wp-json/wp/v2/media`, { method: "POST", headers: { Authorization: wpAuth }, body: form });
        if (!up.ok) throw new Error(`upload ${up.status}`);
        const media = await up.json();
        await fetch(`${WP_URL.replace(/\/+$/, "")}/wp-json/wp/v2/media/${media.id}`, { method: "POST", headers: { Authorization: wpAuth, "Content-Type": "application/json" }, body: JSON.stringify({ alt_text: altText, title: altText }) }).catch(() => {});
        mediaCache.set(imageFilename, media.id);
        return media.id;
    } catch (e) {
        console.warn(`\n⚠ upload swarfarm icon gagal (${imageFilename}): ${e.message?.slice(0, 60)}`);
        mediaCache.set(imageFilename, null);
        return null;
    }
}

function tierLabel(tier) {
    return { band_1_3: "Fresh 1-3 Hari", band_4_7: "Fresh 4-7 Hari", band_8_30: "Fresh 8-30 Hari", old: "Akun Tua" }[tier] || tier;
}
