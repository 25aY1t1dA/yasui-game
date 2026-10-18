#!/usr/bin/env node
/**
 * CLEANER: Hapus kategori game Roblox yang dead demand (sudah tidak ada di Itemku).
 *
 * Sumber: scratch/roblox-dead-games.json (status 'gone' = redirect ke homepage Itemku)
 * Target: child kategori dari "Roblox" (id 17) yang cocok dengan dead games.
 * Safety:
 *   1. Kategori wajib count === 0 (tidak ada produk di dalamnya).
 *   2. Kategori di luar daftar dead TIDAK disentuh.
 *   3. Kategori parent (mis. "Akun", "Roblox") tidak disentuh.
 *
 * Jalankan:
 *   node scratch/clean-dead-roblox-categories.mjs           # dry-run
 *   node scratch/clean-dead-roblox-categories.mjs --apply   # eksekusi
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wcFetch } from "../src/lib/wc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const ROBLOX_PARENT_ID = 17;

const dead = JSON.parse(fs.readFileSync(path.join(__dirname, "roblox-dead-games-final.json"), "utf8")).dead;

/** Slug kandidat yang mungkin dipakai WP untuk sebuah slug Itemku. */
function candidateSlugs(sourceSlug) {
    const noRbx = sourceSlug.replace(/-roblox$/, "");
    return [...new Set([sourceSlug, noRbx])];
}

async function getAllChildCategories(parentId) {
    const out = [];
    for (let page = 1; page <= 10; page++) {
        const p = await wcFetch("products/categories", { params: { parent: parentId, per_page: 100, page, hide_empty: false, orderby: "count", order: "desc" } });
        out.push(...p);
        if (p.length < 100) break;
    }
    return out;
}

async function main() {
    console.log(`=== BERSIHKAN KATEGORI ROBLOX DEAD DEMAND === Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
    const children = await getAllChildCategories(ROBLOX_PARENT_ID);
    console.log(`Total kategori child Roblox: ${children.length}`);

    const deadSet = new Set(dead.flatMap(candidateSlugs));
    const targets = children.filter(c => deadSet.has(c.slug));
    const protectedCats = children.filter(c => !deadSet.has(c.slug));

    console.log(`Kandidat dihapus (cocok dead games): ${targets.length}`);
    console.log(`Dilindungi (masih alive / tak terdaftar dead): ${protectedCats.length}\n`);

    const skippedNonEmpty = [];
    const deleted = [];
    const failed = [];

    for (const c of targets) {
        // double-check: wajib kosong
        if (c.count > 0) { skippedNonEmpty.push({ id: c.id, slug: c.slug, count: c.count }); continue; }
        if (!APPLY) { deleted.push({ id: c.id, slug: c.slug, name: c.name, dryRun: true }); continue; }
        try {
            await wcFetch(`products/categories/${c.id}`, { params: { force: true }, method: "DELETE" });
            deleted.push({ id: c.id, slug: c.slug, name: c.name });
            console.log(`  🗑  ${c.slug} (id=${c.id})`);
        } catch (e) {
            failed.push({ id: c.id, slug: c.slug, error: e.message });
            console.error(`  ⚠ gagal ${c.slug}: ${e.message}`);
        }
    }

    const report = {
        startedAt: new Date().toISOString(),
        dryRun: !APPLY,
        totalChild: children.length,
        matchedTargets: targets.length,
        deleted,
        skippedNonEmpty,
        failed,
        protectedSlugs: protectedCats.map(c => c.slug),
    };
    fs.writeFileSync(path.join(__dirname, "roblox-dead-cleanup-report.json"), JSON.stringify(report, null, 2));

    console.log(`\nRingkasan: ${deleted.length} dihapus, ${skippedNonEmpty.length} dilewati (masih ada produk), ${failed.length} gagal.`);
    console.log("Report: scratch/roblox-dead-cleanup-report.json");

    // tampilkan kategori protected yang menarik (alive games) untuk verifikasi
    const aliveCheck = protectedCats.filter(c => !["roblox-akun"].includes(c.slug));
    console.log(`\nContoh kategori yang dipertahankan (${Math.min(10, aliveCheck.length)} dari ${aliveCheck.length}):`);
    aliveCheck.slice(0, 10).forEach(c => console.log(`  ✓ ${c.slug}`));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
