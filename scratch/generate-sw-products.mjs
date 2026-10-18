#!/usr/bin/env node
/**
 * GENERATOR: Data produk Summoners War untuk WooCommerce (REVIEW DULU, belum diimport)
 *
 * Model (dari owner):
 *   BLESSING (fresh, 0-30 hari) -> 3 band harga: Hari1-3, Hari4-7, Hari8-30
 *   OLD (>=30 hari, harga flat) -> 1 tier
 * Produk = monster(LD nat5) × region(ASIA/GLOBAL/EUROPA) × {band_1_3, band_4_7, band_8_30, old}
 *
 * Jalankan:  node --env-file=.env scratch/generate-sw-products.mjs [--limit=N] [--quick]
 *   --quick : stok cepat (count endpoint, tanpa tarik semua akun) — TIDAK split per band
 *   default : stok akurat per band umur (tarik semua akun blessing+old, LAMBAT)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sky from "../src/lib/skyarena.js";
import { AGE_BANDS, ageBand, makeSku, SW_CATEGORY_SLUG } from "../src/lib/skyarena-stock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const LIMIT = (() => { const m = args.find(a => a.startsWith("--limit=")); return m ? Number(m.split("=")[1]) : null; })();

const TIERS = [
    ...AGE_BANDS.map((b) => ({ key: b.key, label: `Fresh ${b.label}`, type: "blessing" })),
    { key: "old", label: "Akun Tua", type: "old" },
];

const CATEGORY_NAME = "Summoners War: Sky Arena";

function slugify(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function buildIndex(type, regions) {
    // { unitMasterId: { region: { bandKey|old: n } } }
    const idx = {};
    for (const region of regions) {
        console.log(`  Menarik akun ${type} ${region}...`);
        const accs = await sky.getAllAccounts(type, { region, pageSize: 100 });
        const now = new Date();
        for (const acc of accs) {
            const ids = new Set((acc.monsters || []).filter(m => (m.element === "Light" || m.element === "Dark") && m.naturalStars === 5).map(m => String(m.unitMasterId)));
            const bucketKey = type === "blessing" ? ageBand(acc, now) : "old";
            if (!bucketKey) continue; // blessing >30 hari seharusnya tidak ada, tapi jaga-jaga
            for (const id of ids) {
                idx[id] = idx[id] || {};
                idx[id][region] = idx[id][region] || {};
                idx[id][region][bucketKey] = (idx[id][region][bucketKey] || 0) + 1;
            }
        }
        console.log(`  ${type}/${region}: ${accs.length} akun.`);
    }
    return idx;
}

async function main() {
    console.log("Mengambil monster LD nat5 dari SkyArena...");
    let monsters = await sky.getLdNat5Monsters();
    const seen = new Map();
    for (const m of monsters) seen.set(String(m.unitMasterId), m);
    monsters = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (LIMIT) monsters = monsters.slice(0, LIMIT);
    console.log(`Total monster LD nat5: ${monsters.length}${LIMIT ? ` (dibatasi ${LIMIT})` : ""}`);

    let blessingIdx = {}, oldIdx = {};
    if (!QUICK) {
        console.log("Menghitung stok akurat per band umur (LAMBAT)...");
        blessingIdx = await buildIndex("blessing", sky.REGIONS);
        oldIdx = await buildIndex("old", sky.REGIONS);
    } else {
        console.log("Mode cepat: stok total per monster×region×kategori (tanpa split band)...");
    }

    const products = [];
    for (const m of monsters) {
        for (const region of sky.REGIONS) {
            let quickBlessing = null, quickOld = null;
            if (QUICK) {
                try { quickBlessing = await sky.countAccountsWithMonster({ region, unitMasterId: m.unitMasterId, type: "blessing" }); } catch {}
                try { quickOld = await sky.countAccountsWithMonster({ region, unitMasterId: m.unitMasterId, type: "old" }); } catch {}
            }
            for (const tier of TIERS) {
                let stock;
                if (QUICK) {
                    stock = tier.type === "blessing" ? (tier.key === "band_1_3" ? (quickBlessing ?? 0) : 0) : (quickOld ?? 0);
                } else {
                    const src = tier.type === "blessing" ? blessingIdx : oldIdx;
                    stock = src[String(m.unitMasterId)]?.[region]?.[tier.key] ?? 0;
                }
                products.push({
                    sku: makeSku({ unitMasterId: m.unitMasterId, region, tier: tier.key }),
                    name: `${m.name} (${m.element}) — ${region} — ${tier.label}`,
                    monster_name: m.name,
                    element: m.element,
                    unit_master_id: m.unitMasterId,
                    natural_stars: m.naturalStars,
                    image_filename: m.imageFilename,
                    region,
                    account_type: tier.type,
                    tier: tier.key,
                    tier_label: tier.label,
                    stock,
                    stock_status: stock > 0 ? "instock" : "outofstock",
                    category: CATEGORY_NAME,
                    slug: `${slugify(m.name)}-${m.element.toLowerCase()}-${region.toLowerCase()}-${tier.key}`,
                    description: tier.type === "blessing" ? `Akun fresh (${tier.label} sejak dibuat). Harga bertingkat per umur.` : "Akun tua (≥30 hari). Harga flat.",
                    regular_price: "", // diisi owner dari data harga
                });
            }
        }
    }

    const jsonPath = path.join(__dirname, "sw-products.json");
    fs.writeFileSync(jsonPath, JSON.stringify({ generated_at: new Date().toISOString(), model: "blessing(band_1_3/4_7/8_30)+old", count: products.length, products }, null, 2));

    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["sku", "name", "monster_name", "element", "region", "account_type", "tier", "tier_label", "stock", "stock_status", "slug", "unit_master_id", "category", "regular_price"];
    fs.writeFileSync(path.join(__dirname, "sw-products.csv"), [header.join(",")].concat(products.map(p => header.map(h => esc(p[h])).join(","))).join("\n"));

    console.log(`\n✅ ${products.length} produk dihasilkan (model blessing+old).`);
    console.log(`   JSON: ${jsonPath}`);
    const luc = products.filter(p => p.monster_name === "Lucifer");
    if (luc.length) { console.log("\nContoh (Lucifer):"); luc.slice(0, 8).forEach(p => console.log(`  ${p.sku} | stok=${p.stock} | ${p.stock_status}`)); }
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
