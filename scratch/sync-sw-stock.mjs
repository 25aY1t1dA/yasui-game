/**
 * SYNC STOK SUMMONERS WAR (SkyArena → WooCommerce)
 *
 * Strategi (sesuai SKYARENA-API.md: full scan lambat 4-7 dtk/request):
 *   1. Full scan awal (buildBlessingSnapshot + buildOldSnapshot) → update semua produk
 *   2. SSE real-time blessing/old → event perubahan → debounced refresh cepat:
 *      meta per region TIDAK memberi stok per monster, jadi saat event masuk kita
 *      re-scan region terkait (getAllAccounts per region ≈ 1-2 mnt) → recompute → update produk
 *   3. Loop harian: full scan ulang (jaring aman)
 *
 * Jalankan: node --env-file=.env scratch/sync-sw-stock.mjs [--once] [--no-sse] [--full-interval-min=720]
 *   --once          : full scan sekali lalu keluar (tanpa SSE/loop)
 *   --no-sse        : tanpa SSE, hanya interval full scan
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sky from "../src/lib/skyarena.js";
import {
    AGE_BANDS, ageBand, makeSku, setProductStock,
} from "../src/lib/skyarena-stock.js";
import { wcFetch } from "../src/lib/wc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const NO_SSE = args.includes("--no-sse");
const FULL_INTERVAL_MS = (() => {
    const m = args.find((a) => a.startsWith("--full-interval-min="));
    return m ? Number(m.split("=")[1]) * 60_000 : 12 * 60 * 60_000; // default 12 jam
})();
const STATE_PATH = path.join(__dirname, "sw-sync-state.json");

/* ---------- cache produk WP: sku → {id, stock} ---------- */
const productCache = new Map(); // sku → { id }
async function loadProducts() {
    let page = 1;
    while (true) {
        const prods = await wcFetch("products", {
            params: { category: 18, per_page: 100, page, status: "any", _: Date.now() + page },
        });
        for (const p of prods) if (p.sku) productCache.set(p.sku, { id: p.id });
        if (prods.length < 100) break;
        page++;
    }
    console.log(`Cache produk WP: ${productCache.size} SKU`);
}

/* ---------- hitung snapshot stok per monster×region×tier ---------- */
function accumulateAccounts(accs, now) {
    // { "<unitMasterId>": { region: { band_1_3:n, band_4_7:n, band_8_30:n, old:n } } }
    const snap = {};
    for (const acc of accs) {
        const band = ageBand(acc, now); // null jika old-style >30 (untuk type blessing)
        const ids = new Set(
            (acc.monsters || [])
                .filter((m) => (m.element === "Light" || m.element === "Dark") && m.naturalStars === 5)
                .map((m) => String(m.unitMasterId)),
        );
        for (const id of ids) {
            snap[id] = snap[id] || {};
            snap[id][acc.regionLabel] = snap[id][acc.regionLabel] || {};
        }
    }
    return snap;
}

async function fullScan() {
    const t0 = Date.now();
    const counts = {}; // sku → stock
    for (const region of sky.REGIONS) {
        for (const type of ["blessing", "old"]) {
            const accs = await sky.getAllAccounts(type, { region, pageSize: 100 });
            const now = new Date();
            for (const acc of accs) {
                let tier = null;
                if (type === "blessing") tier = ageBand(acc, now); // band_1_3/4_7/8_30 atau null
                else tier = "old";
                if (!tier) continue;
                const ids = new Set(
                    (acc.monsters || [])
                        .filter((m) => (m.element === "Light" || m.element === "Dark") && m.naturalStars === 5)
                        .map((m) => String(m.unitMasterId)),
                );
                for (const id of ids) {
                    const sku = makeSku({ unitMasterId: id, region, tier });
                    counts[sku] = (counts[sku] || 0) + 1;
                }
            }
            console.log(`  scan ${type}/${region}: ${accs.length} akun`);
        }
    }
    console.log(`Full scan selesai dalam ${Math.round((Date.now() - t0) / 1000)}dtk — ${Object.keys(counts).length} SKU berstok`);
    return counts;
}

/* ---------- update WooCommerce ---------- */
async function applyCounts(counts) {
    let updated = 0, zeroed = 0;
    for (const [sku, info] of productCache) {
        const stock = counts[sku] || 0;
        try {
            await setProductStock(info.id, { stockQuantity: stock, inStock: stock > 0 });
            if (stock > 0) updated++; else zeroed++;
        } catch (e) {
            console.warn(`✗ ${sku}: ${e.message?.slice(0, 60)}`);
        }
        await new Promise((r) => setTimeout(r, 150));
    }
    console.log(`WP update: ${updated} berstok, ${zeroed} kosong`);
}

/* ---------- debounced rescan per (type, region) saat SSE event ---------- */
const pendingRescan = new Set(); // "blessing|ASIA"
let rescanTimer = null;
function scheduleRescan(type, region) {
    pendingRescan.add(`${type}|${region}`);
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(async () => {
        const jobs = [...pendingRescan].map((s) => s.split("|"));
        pendingRescan.clear();
        console.log(`SSE → rescan: ${jobs.map(j => j.join("/")).join(", ")}`);
        for (const [t, r] of jobs) {
            try {
                const accs = await sky.getAllAccounts(t, { region: r, pageSize: 100 });
                const now = new Date();
                const updates = [];
                for (const acc of accs) {
                    const tier = t === "blessing" ? ageBand(acc, now) : "old";
                    if (!tier) continue;
                    const ids = new Set(
                        (acc.monsters || [])
                            .filter((m) => (m.element === "Light" || m.element === "Dark") && m.naturalStars === 5)
                            .map((m) => String(m.unitMasterId)),
                    );
                    for (const id of ids) updates.push(makeSku({ unitMasterId: id, region: r, tier }));
                }
                // Hitung ulang stok untuk region tsb: SKU region lain ambil dari state terakhir (kita rebuild penuh region saja)
                await rescanRegionApply(r, updates);
            } catch (e) {
                console.warn(`rescan ${t}/${r} gagal: ${e.message?.slice(0, 80)}`);
            }
        }
    }, 60_000); // debounce 1 menit — tunggu gelombang event selesai
}

/** Recompute stok satu region: SKU region ini dihitung fresh, region lain pakai nilai terakhir tersimpan */
async function rescanRegionApply(region, skuListRegion) {
    const state = readState();
    const counts = state.counts || {};
    // reset stok SKU region ini dulu
    for (const sku of Object.keys(counts)) {
        if (sku.includes(`-${region.toLowerCase()}-`)) delete counts[sku];
    }
    for (const sku of skuListRegion) counts[sku] = (counts[sku] || 0) + 1;
    writeState({ counts, updatedAt: new Date().toISOString() });
    await applyCounts(counts);
}

/* ---------- state persist ---------- */
function readState() {
    try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch { return {}; }
}
function writeState(obj) {
    fs.writeFileSync(STATE_PATH, JSON.stringify(obj, null, 1));
}

/* ---------- SSE listener generic (blessing + old) ---------- */
function listenSse(type, onEvent, { onError = () => {} } = {}) {
    let aborted = false, abortCtrl = null;
    (async function connect() {
        while (!aborted) {
            try {
                const token = await sky.login();
                abortCtrl = new AbortController();
                const res = await fetch(`${sky.BASE_URL}${sky.ACCOUNT_TYPES[type].sse}`, {
                    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
                    signal: abortCtrl.signal,
                });
                if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buf = "";
                while (!aborted) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                    const parts = buf.split("\n\n");
                    buf = parts.pop();
                    for (const part of parts) {
                        const line = part.split("\n").find((l) => l.startsWith("data:"));
                        if (!line) continue;
                        try { onEvent(JSON.parse(line.slice(5).trim())); } catch {}
                    }
                }
            } catch (e) { if (!aborted) onError(e); }
            if (!aborted) await new Promise((r) => setTimeout(r, 5000));
        }
    })();
    return () => { aborted = true; if (abortCtrl) abortCtrl.abort(); };
}

/* ---------- MAIN ---------- */
async function main() {
    console.log(`=== SYNC STOK SW — ${ONCE ? "once" : NO_SSE ? "interval only" : "full+SSE"} ===`);
    await loadProducts();

    console.log("Full scan awal...");
    const counts = await fullScan();
    writeState({ counts, updatedAt: new Date().toISOString() });
    await applyCounts(counts);

    if (ONCE) return;

    if (!NO_SSE) {
        for (const type of ["blessing", "old"]) {
            listenSse(type, (ev) => {
                // event apapun (update stok/akun baru) → jadwalkan rescan region terkait
                const region = ev?.region || ev?.regionLabel || null;
                if (region && sky.REGIONS.includes(region)) scheduleRescan(type, region);
                else scheduleRescan(type, "ASIA"); // fallback: scan ASIA (region tidak teridentifikasi)
            }, (e) => console.warn(`SSE ${type} error: ${e.message?.slice(0, 60)}`));
        }
        console.log("SSE blessing+old aktif (debounce rescan 1 menit)");
    }

    // jaring aman: full scan berkala
    setInterval(async () => {
        console.log("Interval full scan...");
        try {
            const c = await fullScan();
            writeState({ counts: c, updatedAt: new Date().toISOString() });
            await applyCounts(c);
        } catch (e) {
            console.warn("interval fullScan gagal:", e.message?.slice(0, 100));
        }
    }, FULL_INTERVAL_MS);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
