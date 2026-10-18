#!/usr/bin/env node
/**
 * ICON AUTO-UPDATER — Sync icon game terbaru ke WordPress/Yasui.
 *
 * Alur:
 *   1. Mining icon terbaru (Roblox thumbnails API / Play og:image / AppStore artwork / fallback Itemku og:image)
 *   2. Bandingkan dengan icon yang sudah terpasang (meta term `_yasui_icon_source_url` di kategori WP)
 *   3. Jika berubah: download -> upload ke WP Media (multipart) -> attach ke kategori (thumbnail/term meta)
 *   4. Report per run: scratch/icon-sync-report.json
 *
 * Catatan WP:
 *   - Kategori produk WP tidak punya "featured image" native; Yasui memakai term meta
 *     `_yasui_icon_source_url` + `_yasui_icon_attachment_id` (dibaca tema/frontend untuk render).
 *   - Upload media memakai endpoint wp/v2/media (auth Basic sama dengan wcFetch).
 *
 * Jalankan:
 *   node scratch/icon-auto-updater.mjs              # cek + sync (hanya yang berubah)
 *   node scratch/icon-auto-updater.mjs --dry        # laporkan perubahan tanpa upload
 *   node scratch/icon-auto-updater.mjs --force      # upload ulang semua
 *   node scratch/icon-auto-updater.mjs --game=fish-it
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wcFetch, WP_URL } from "../src/lib/wc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const ONLY = args.find(a => a.startsWith("--game="))?.split("=")[1] || null;
const REPORT = { startedAt: new Date().toISOString(), dryRun: DRY, checked: 0, changed: 0, uploaded: 0, failed: 0, details: [] };

const ICONS = JSON.parse(fs.readFileSync(path.join(__dirname, "game-icons.json"), "utf8"));

/** Pilih icon terbaik per game (prioritas: roblox > playStore > appStore > itemku) */
function pickIcon(entry) {
    return entry?.roblox?.imageUrl || entry?.playStore?.imageUrl || entry?.appStore?.imageUrl || entry?.itemku?.imageUrl || null;
}

/** Auth header dari env — Application Password WP (untuk wp/v2 media), fallback WC keys */
function authHeader() {
    const user = process.env.WP_APP_USER || "";
    const pass = process.env.WP_APP_PASSWORD || "";
    if (user && pass) return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
    // fallback (akan 401 di wp/v2 tapi tetap terstruktur)
    const key = process.env.WC_CONSUMER_KEY || "";
    const secret = process.env.WC_CONSUMER_SECRET || "";
    return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

function hasAppPassword() {
    return !!(process.env.WP_APP_USER && process.env.WP_APP_PASSWORD);
}

/** Upload image ke WP Media via multipart */
async function uploadToWpMedia(filename, buffer, contentType = "image/png", altText = "") {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: contentType }), filename);
    const res = await fetch(`${WP_URL.replace(/\/+$/, "")}/wp-json/wp/v2/media`, {
        method: "POST",
        headers: { Authorization: authHeader(), "Content-Disposition": `attachment; filename="${filename}"` },
        body: form,
    });
    if (!res.ok) throw new Error(`media upload HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const media = await res.json();
    if (altText) {
        await fetch(media._links?.self?.[0]?.href || `${WP_URL.replace(/\/+$/, "")}/wp-json/wp/v2/media/${media.id}`, {
            method: "POST",
            headers: { Authorization: authHeader(), "Content-Type": "application/json" },
            body: JSON.stringify({ alt_text: altText, title: altText }),
        }).catch(() => {});
    }
    return media;
}

/** Set term meta pada kategori */
async function setTermMeta(termId, key, value) {
    return wcFetch(`products/categories/${termId}`, { method: "PUT", body: { meta_data: [{ key, value }] } });
}

/** Ambil term meta existing */
function getMeta(term, key) {
    return (term.meta_data || []).find(m => m.key === key)?.value || null;
}

async function processCategory(cat) {
    REPORT.checked++;
    const entry = ICONS[cat.slug];
    const latestUrl = pickIcon(entry);
    if (!latestUrl) { REPORT.details.push({ slug: cat.slug, status: "no-icon" }); return; }

    const currentUrl = cat._meta?.currentUrl;
    if (!FORCE && currentUrl === latestUrl) { REPORT.details.push({ slug: cat.slug, status: "unchanged" }); return; }
    REPORT.changed++;

    if (DRY) { REPORT.details.push({ slug: cat.slug, status: "would-update", from: currentUrl, to: latestUrl }); return; }

    try {
        const res = await fetch(latestUrl);
        if (!res.ok) throw new Error(`download HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = latestUrl.match(/\.(png|jpe?g|webp)/i)?.[1] || "png";
        const filename = `yasui-game-icon-${cat.slug}-${Date.now()}.${ext}`;
        const media = await uploadToWpMedia(filename, buf, res.headers.get("content-type") || "image/png", `Icon ${cat.name}`);
        await setTermMeta(cat.id, "_yasui_icon_source_url", latestUrl);
        await setTermMeta(cat.id, "_yasui_icon_attachment_id", media.id);
        REPORT.uploaded++;
        REPORT.details.push({ slug: cat.slug, status: "updated", mediaId: media.id, url: latestUrl });
        console.log(`  ↑ ${cat.slug}: media #${media.id}`);
    } catch (e) {
        REPORT.failed++;
        REPORT.details.push({ slug: cat.slug, status: "error", error: e.message });
        console.error(`  ✗ ${cat.slug}: ${e.message}`);
    }
}

async function main() {
    console.log(`=== ICON AUTO-UPDATER === ${DRY ? "(DRY-RUN)" : FORCE ? "(FORCE)" : ""}`);
    if (!DRY && !hasAppPassword()) {
        console.error("✗ WP_APP_USER & WP_APP_PASSWORD belum diisi di .env (Application Password WP).");
        console.error("  Buat di: WP Admin → Users → Profile → Application Passwords.");
        console.error("  Atau jalankan dengan --dry untuk hanya cek perubahan.");
        process.exit(1);
    }
    const cats = JSON.parse(fs.readFileSync(path.join(__dirname, "wp-roblox-cats-final.json"), "utf8"));
    const targets = ONLY ? cats.filter(c => c.slug === ONLY) : cats;

    // Ambil meta existing per kategori (chunked: wcFetch categories returns meta_data)
    for (const c of targets) {
        try {
            const term = await wcFetch(`products/categories/${c.id}`, { params: { context: "edit" } });
            c._meta = { currentUrl: getMeta(term, "_yasui_icon_source_url") };
        } catch { c._meta = {}; }
        await processCategory(c);
    }

    REPORT.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, "icon-sync-report.json"), JSON.stringify(REPORT, null, 2));
    console.log(`\nCek: ${REPORT.checked} | berubah: ${REPORT.changed} | upload: ${REPORT.uploaded} | gagal: ${REPORT.failed}`);
    console.log("Report: scratch/icon-sync-report.json");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
