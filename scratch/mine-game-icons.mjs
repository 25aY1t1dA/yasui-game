#!/usr/bin/env node
/**
 * ICON MINER — Ambil icon resmi terbaru untuk game Roblox & non-Roblox.
 *
 * Sumber:
 *   1. Roblox  : omni-search (universeId) -> thumbnails.roblox.com games/icons (512px, PNG)
 *   2. Play Store : scrape og:image halaman store (perlu packageId)
 *   3. App Store  : iTunes Search API resmi (artworkUrl512, otomatis ikut icon event terbaru)
 *
 * Output: scratch/game-icons.json { slug: { source, url/universeId, packageId, fetchedAt, imageUrl } }
 *
 * Jalankan:
 *   node scratch/mine-game-icons.mjs --roblox                      # semua kategori Roblox alive
 *   node scratch/mine-game-icons.mjs --play=com.miHoYo.GenshinImpact:genshin-impact
 *   node scratch/mine-game-icons.mjs --appstore=genshin            # search by nama
 *   node scratch/mine-game-icons.mjs --list                        # tampilkan hasil tersimpan
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(__dirname, "game-icons.json");
const args = process.argv.slice(2);
const loadDb = () => fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, "utf8")) : {};
const saveDb = (db) => fs.writeFileSync(DB, JSON.stringify(db, null, 2));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- Roblox ----------
async function robloxUniverseId(name) {
    const url = `https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(name)}&pageToken=&sessionId=${crypto.randomUUID()}&pageType=all`;
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`omni-search HTTP ${r.status}`);
    const j = await r.json();
    const hits = (j.searchResults || []).flatMap(v => v.contents || []);
    const exact = hits.find(h => h.name?.toLowerCase() === name.toLowerCase()) || hits[0];
    if (!exact?.universeId) throw new Error(`universe tidak ditemukan untuk "${name}"`);
    return { universeId: exact.universeId, matchedName: exact.name };
}

async function robloxIcon(universeId) {
    const r = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`);
    if (!r.ok) throw new Error(`thumbnails HTTP ${r.status}`);
    const j = await r.json();
    const d = j.data?.[0];
    if (!d || d.state !== "Completed") throw new Error(`thumbnail state=${d?.state || "null"}`);
    return d.imageUrl;
}

async function mineRoblox() {
    const cats = JSON.parse(fs.readFileSync(path.join(__dirname, "wp-roblox-cats-final.json"), "utf8"));
    const db = loadDb();
    let ok = 0, fail = 0;
    for (const c of cats) {
        if (db[c.slug]?.roblox?.imageUrl) { ok++; continue; } // cache, skip
        try {
            const { universeId, matchedName } = await robloxUniverseId(c.name);
            await sleep(250);
            const imageUrl = await robloxIcon(universeId);
            db[c.slug] = { ...db[c.slug], roblox: { universeId, matchedName, imageUrl, fetchedAt: new Date().toISOString() } };
            ok++;
            console.log(`  ✓ ${c.slug} -> ${matchedName} (${universeId})`);
        } catch (e) {
            fail++;
            db[c.slug] = { ...db[c.slug], roblox: { error: e.message, triedAt: new Date().toISOString() } };
            console.log(`  ✗ ${c.slug}: ${e.message}`);
        }
        saveDb(db);
        await sleep(250 + Math.random() * 300);
    }
    console.log(`\nRoblox selesai: ${ok} ok, ${fail} gagal (cache dipertahankan).`);
}

// ---------- Play Store ----------
async function minePlay(pkg, slug) {
    const r = await fetch(`https://play.google.com/store/apps/details?id=${pkg}&hl=id`);
    if (!r.ok) throw new Error(`Play Store HTTP ${r.status}`);
    const html = await r.text();
    const m = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (!m) throw new Error("og:image tidak ditemukan");
    const big = m[1].replace(/=s\d+.*$/, "=s512");
    const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || pkg;
    const db = loadDb();
    db[slug] = { ...db[slug], playStore: { packageId: pkg, title, imageUrl: big, fetchedAt: new Date().toISOString() } };
    saveDb(db);
    console.log(`  ✓ ${slug} (Play): ${title} -> ${big}`);
}

// ---------- App Store ----------
async function mineAppStore(term, slug) {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=id&entity=software&limit=1`);
    if (!r.ok) throw new Error(`iTunes HTTP ${r.status}`);
    const j = await r.json();
    const a = j.results[0];
    if (!a) throw new Error(`tidak ada hasil untuk "${term}"`);
    const imageUrl = (a.artworkUrl512 || a.artworkUrl100 || "").replace("100x100bb", "512x512bb");
    const db = loadDb();
    db[slug || a.bundleId] = { ...db[slug || a.bundleId], appStore: { bundleId: a.bundleId, title: a.trackName, imageUrl, fetchedAt: new Date().toISOString() } };
    saveDb(db);
    console.log(`  ✓ ${slug || a.bundleId} (AppStore): ${a.trackName} -> ${imageUrl}`);
}

// ---------- CLI ----------
(async () => {
    if (args.includes("--roblox")) return mineRoblox();
    if (args.includes("--list")) { console.log(JSON.stringify(loadDb(), null, 1)); return; }
    for (const a of args) {
        if (a.startsWith("--play=")) { const [pkg, slug] = a.slice(7).split(":"); await minePlay(pkg, slug || pkg).catch(e => console.error("  ✗", e.message)); }
        if (a.startsWith("--appstore=")) { const [term, slug] = a.slice(11).split(":"); await mineAppStore(term, slug).catch(e => console.error("  ✗", e.message)); }
    }
    if (!args.length) console.log("Gunakan --roblox | --play=pkg:slug | --appstore=term:slug | --list");
})();
