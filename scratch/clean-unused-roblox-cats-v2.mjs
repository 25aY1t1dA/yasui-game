#!/usr/bin/env node
/**
 * CLEANER V2: Hapus child kategori Roblox yang tidak digunakan / game dead.
 * TELITI — pengaman berlapis:
 *   1. Kategori di-resolve ke game prefix; hanya dihapus jika game terverifikasi DEAD (Itemku live check).
 *   2. Kategori game ALIVE tidak disentuh sama sekali (meski kosong) — termasuk sub-type-nya.
 *   3. Kategori yang tidak bisa di-resolve (unmatched) TIDAK disentuh, hanya dilaporkan.
 *   4. Wajib count === 0 saat eksekusi (double-check per kategori).
 *   5. Hanya menyentuh child langsung dari "Roblox" (id 17).
 *
 * Jalankan:
 *   node scratch/clean-unused-roblox-cats-v2.mjs           # dry-run
 *   node scratch/clean-unused-roblox-cats-v2.mjs --apply   # eksekusi
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wcFetch } from "../src/lib/wc.js";
import { gameStatus } from "./resolve-wp-roblox-cats.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const PARENT_ID = 17;

async function fetchAllChildren() {
    const seen = new Map();
    for (let page = 1; page <= 10; page++) {
        const p = await wcFetch("products/categories", { params: { parent: PARENT_ID, per_page: 100, page, hide_empty: false, orderby: "id", order: "asc" } });
        p.forEach(c => seen.set(c.id, { id: c.id, slug: c.slug, name: c.name, count: c.count }));
        if (p.length < 100) break;
    }
    return [...seen.values()];
}

async function main() {
    console.log(`=== CLEANER V2 CHILD ROBLOX === Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
    const cats = await fetchAllChildren();
    console.log(`Child Roblox: ${cats.length}`);

    const toDelete = [], keepAlive = [], unmatched = [], skipNonEmpty = [];

    for (const c of cats) {
        const st = gameStatus(c.slug);
        if (!st.known) { unmatched.push(c); continue; }
        if (st.alive) { keepAlive.push(c); continue; }
        if (st.dead) {
            if (c.count > 0) { skipNonEmpty.push(c); continue; }
            toDelete.push(c);
        }
    }

    console.log(`\nKeep (game alive): ${keepAlive.length}`);
    console.log(`Kandidat hapus (game dead): ${toDelete.length}`);
    console.log(`Unmatched (tidak disentuh): ${unmatched.length} ${unmatched.map(c => c.slug).join(", ")}`);
    console.log(`Skip non-empty: ${skipNonEmpty.length}`);

    const deleted = [], failed = [];
    for (const c of toDelete) {
        if (!APPLY) { deleted.push({ id: c.id, slug: c.slug, dryRun: true }); continue; }
        try {
            await wcFetch(`products/categories/${c.id}`, { params: { force: true }, method: "DELETE" });
            deleted.push({ id: c.id, slug: c.slug });
        } catch (e) {
            failed.push({ id: c.id, slug: c.slug, error: e.message });
        }
    }

    const report = {
        startedAt: new Date().toISOString(),
        dryRun: !APPLY,
        totalChildren: cats.length,
        keepAlive: keepAlive.length,
        deleted,
        failed,
        unmatched: unmatched.map(c => c.slug),
        skipNonEmpty: skipNonEmpty.map(c => c.slug),
    };
    fs.writeFileSync(path.join(__dirname, "roblox-cats-cleanup-v2-report.json"), JSON.stringify(report, null, 2));
    console.log(`\n${APPLY ? "Dihapus" : "Akan dihapus"}: ${deleted.length} | gagal: ${failed.length} | dilewati: ${skipNonEmpty.length} | unmatched aman: ${unmatched.length}`);
    console.log("Report: scratch/roblox-cats-cleanup-v2-report.json");

    // verifikasi pasca
    if (APPLY) {
        const after = await fetchAllChildren();
        const deadLeft = after.filter(c => { const st = gameStatus(c.slug); return st.known && st.dead; });
        console.log(`\nVerifikasi: sisa child = ${after.length}, dead tersisa = ${deadLeft.length}${deadLeft.length ? " -> " + deadLeft.map(c => c.slug).join(",") : " ✓"}`);
    }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
