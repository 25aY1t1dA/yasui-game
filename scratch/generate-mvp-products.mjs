#!/usr/bin/env node
/**
 * GENERATOR: Draft produk + atribut WooCommerce untuk kandidat MVP Roblox.
 * Hanya membuat file review (JSON + CSV). TIDAK mengimport apa pun ke WP.
 *
 * Sumber:
 *   scratch/roblox-demand.json    -> demand per game/type (jumlah listing Itemku)
 *   scratch/roblox-mvp-score.json -> skor MVP (demand × depth filter)
 *   scratch/roblox-filter-schema.json -> opsi filter ternormalisasi per game×tab
 *
 * Output:
 *   scratch/roblox-mvp-products.json  — draft produk lengkap (per kandidat)
 *   scratch/roblox-mvp-products.csv   — ringkasan untuk review cepat
 *
 * Jalankan: node scratch/generate-mvp-products.mjs [--top=N] [--stock-max=N]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (k, d) => { const m = args.find(a => a.startsWith(`--${k}=`)); return m ? Number(m.split("=")[1]) : d; };
const TOP = getArg("top", 8);
const STOCK_MAX = getArg("stock-max", 3);

const demand = JSON.parse(fs.readFileSync(path.join(__dirname, "roblox-demand.json"), "utf8"));
const score = JSON.parse(fs.readFileSync(path.join(__dirname, "roblox-mvp-score.json"), "utf8"));
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "roblox-filter-schema.json"), "utf8"));

const demandMap = new Map(demand.games.map(g => [g.sourceGame, g]));
const GAME_LABEL = (slug) => slug
    .replace(/-roblox$/, "")
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** Rebuild per-tab map dengan key tab yang benar dari struktur schema asli. */
function tabsByGame() {
    const out = {};
    for (const t of schema.tabs) {
        const g = t.game?.sourceSlug;
        if (!g) continue;
        out[g] = out[g] || {};
        const key = t.type?.sourceSlug || t.key || "akun";
        out[g][key] = t;
    }
    return out;
}

const tabs = tabsByGame();

/** Kumpulkan opsi unik untuk sebuah game (semua tab) per nama filter. */
function filterOptionsFor(game) {
    const merged = {};
    for (const [tabKey, tab] of Object.entries(tabs[game] || {})) {
        for (const f of tab.filters || []) {
            const name = f.name || f.key;
            if (!name) continue;
            merged[name] = merged[name] || new Set();
            for (const o of f.options || []) merged[name].add(o?.name ?? o?.key ?? String(o));
        }
    }
    return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, [...v].sort()]));
}

/** Pilih item types yang akan dijadikan produk (type dengan listing > 0, gabung beberapa). */
function pickTypes(game) {
    const d = demandMap.get(game);
    if (!d || !d.counts) return [];
    return Object.entries(d.counts)
        .filter(([k, v]) => (v || 0) > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({ slug: k, listing: v }));
}

function slugify(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const results = [];

for (const r of score.rows.slice(0, TOP)) {
    const game = r.game;
    const d = demandMap.get(game);
    if (!d) continue;
    const label = GAME_LABEL(game);
    const options = filterOptionsFor(game);
    const types = pickTypes(game).slice(0, 4); // top 4 type per game

    const attributes = Object.entries(options).map(([name, opts]) => ({
        name,
        visible: true,
        variation: false,
        options: opts.slice(0, 30), // cap opsi agar atribut tidak membengkak
    }));

    const products = [];
    for (const t of types) {
        const capped = (t.listing || 0) >= 1012;
        for (let i = 1; i <= Math.min(STOCK_MAX, Math.max(1, Math.min(t.listing || 1, STOCK_MAX))); i++) {
            const suffix = STOCK_MAX > 1 ? ` #${i}` : "";
            products.push({
                sku: `RBX-${slugify(game).slice(0, 20)}-${t.slug}`.toUpperCase().slice(0, 60) + (STOCK_MAX > 1 ? `-${i}` : ""),
                name: `${label} — ${t.slug}${suffix}`,
                game: game,
                game_label: label,
                item_type: t.slug,
                listing_source: capped ? `${t.listing}+` : String(t.listing),
                listing_capped: capped,
                stock: t.listing || 0,
                stock_status: (t.listing || 0) > 0 ? "instock" : "outofstock",
                regular_price: "", // diisi owner
                category: "Roblox",
                slug: `${slugify(game)}-${slugify(t.slug)}${STOCK_MAX > 1 ? `-${i}` : ""}`,
                description: `Listing ${t.slug} untuk ${label}. Demand sumber (Itemku): ${capped ? t.listing + "+" : t.listing} listing aktif.`,
            });
        }
    }

    results.push({
        game,
        game_label: label,
        total_listing: r.totalListing,
        mvp_score: r.mvpScore,
        attributes,
        attribute_count: attributes.length,
        products,
        product_count: products.length,
    });
}

const outJson = path.join(__dirname, "roblox-mvp-products.json");
fs.writeFileSync(outJson, JSON.stringify({ generated_at: new Date().toISOString(), top: TOP, stock_max: STOCK_MAX, candidates: results }, null, 2));

const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const header = ["sku", "name", "game", "item_type", "listing_source", "stock", "stock_status", "category", "slug", "regular_price"];
const csv = [header.join(",")].concat(
    results.flatMap(c => c.products.map(p => header.map(h => esc(p[h])).join(",")))
).join("\n");
fs.writeFileSync(path.join(__dirname, "roblox-mvp-products.csv"), csv + "\n");

console.log(`✅ Draft MVP dihasilkan untuk ${results.length} kandidat:`);
for (const c of results) {
    console.log(`  ${c.game.padEnd(30)} listing=${String(c.total_listing).padStart(5)} score=${String(c.mvp_score).padStart(5)} atribut=${String(c.attribute_count).padStart(2)} produk=${c.product_count}`);
}
console.log(`\nJSON: ${outJson}`);
console.log(`CSV : ${path.join(__dirname, "roblox-mvp-products.csv")}`);
console.log("\nCatatan: listing_source '1012+' berarti ter-capped pagination Itemku (>=1012 listing aktif).");
