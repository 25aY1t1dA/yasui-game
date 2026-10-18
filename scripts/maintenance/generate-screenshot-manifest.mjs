#!/usr/bin/env node
/**
 * MANIFEST SCREENSHOT PRODUK
 * Menghasilkan daftar nama file screenshot yang perlu Anda siapkan per monster,
 * plus struktur foldernya, agar mudah di-mapping ke produk WooCommerce.
 *
 * Output:
 *   scripts/maintenance/sw-screenshot-manifest.json  -> daftar lengkap (nama file yang diharapkan)
 *   scripts/maintenance/sw-screenshot-manifest.csv   -> checklist spreadsheet
 *   public/assets/games/sw/            -> folder tujuan (dibuat kosong + .gitkeep)
 *
 * Konvensi nama file: <slug-nama>-<element>.png  (misal lucifer-light.png, gandalf-dark.png)
 * Jalankan: node --env-file=.env scripts/maintenance/generate-screenshot-manifest.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sky from "../../src/lib/skyarena.js";
import { loadPriceList } from "../../src/lib/skyarena-pricelist.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../../public/assets/games/sw");

function slugify(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function main() {
    const ld = await sky.getLdNat5Monsters();
    const official = [...new Map(ld.map((m) => [String(m.unitMasterId), m])).values()]
        .sort((a, b) => a.name.localeCompare(b.name));
    const prices = loadPriceList();

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, ".gitkeep"), "");

    const rows = official.map((m) => {
        const hasPrice = prices.has(m.name.toLowerCase());
        const filename = `${slugify(m.name)}-${m.element.toLowerCase()}.png`;
        return {
            filename,
            monster_name: m.name,
            element: m.element,
            unit_master_id: m.unitMasterId,
            natural_stars: m.naturalStars,
            has_price: hasPrice,
            target_path: `public/assets/games/sw/${filename}`,
            status: "pending",
        };
    });

    fs.writeFileSync(
        path.join(__dirname, "sw-screenshot-manifest.json"),
        JSON.stringify({ generated_at: new Date().toISOString(), folder: "public/assets/games/sw/", convention: "<slug>-<element>.png", count: rows.length, items: rows }, null, 2)
    );

    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["filename", "monster_name", "element", "has_price", "status"];
    fs.writeFileSync(
        path.join(__dirname, "sw-screenshot-manifest.csv"),
        [header.join(",")].concat(rows.map((r) => header.map((h) => esc(r[h])).join(","))).join("\n")
    );

    const needPrice = rows.filter((r) => r.has_price).length;
    console.log(`✅ Manifest dibuat: ${rows.length} monster (${needPrice} dengan harga, ${rows.length - needPrice} kolaborasi/tanpa harga).`);
    console.log(`   Folder tujuan screenshot: ${OUT_DIR}`);
    console.log(`   Konvensi nama: <slug-nama>-<element>.png  (contoh: ${rows.find(r=>r.monster_name==="Lucifer"&&r.element==="Light")?.filename || "lucifer-light.png"})`);
    console.log(`   Checklist: scratch/sw-screenshot-manifest.csv`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
