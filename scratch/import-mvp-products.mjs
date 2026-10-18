#!/usr/bin/env node
/**
 * IMPORTER: Buat Global Attributes + Products di WooCommerce dari draft MVP Roblox.
 *
 * DEFAULT DRY-RUN: tidak menulis apa pun ke WP. Gunakan --apply untuk eksekusi nyata.
 *
 * Sumber: scratch/roblox-mvp-products.json (dari generate-mvp-products.mjs)
 * Output: scratch/roblox-mvp-import-report.json
 *
 * Jalankan:
 *   node scratch/import-mvp-products.mjs                # dry-run (log rencana saja)
 *   node scratch/import-mvp-products.mjs --apply        # eksekusi nyata
 *   node scratch/import-mvp-products.mjs --apply --game=fish-it   # satu game saja
 *   node scratch/import-mvp-products.mjs --apply --attrs-only     # hanya atribut global
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wcFetch } from "../src/lib/wc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ATTRS_ONLY = args.includes("--attrs-only");
const getArg = (k) => { const m = args.find(a => a.startsWith(`--${k}=`)); return m ? m.split("=")[1] : null; };
const ONLY_GAME = getArg("game");

const draft = JSON.parse(fs.readFileSync(path.join(__dirname, "roblox-mvp-products.json"), "utf8"));
const REPORT = { startedAt: new Date().toISOString(), dryRun: !APPLY, attributes: [], products: [], errors: [] };

async function ensureCategory(name, slug, parentId = 0) {
    const existing = await wcFetch("products/categories", { params: { slug, per_page: 10, hide_empty: false } });
    const hit = existing.find(c => c.parent === parentId);
    if (hit) return hit;
    if (!APPLY) return { id: null, name, slug, parent: parentId, dryRun: true };
    return wcFetch("products/categories", { method: "POST", body: { name, slug, parent: parentId } });
}

async function ensureGlobalAttribute(name, slug) {
    const existing = await wcFetch("products/attributes", { params: { per_page: 100 } });
    const hit = existing.find(a => a.slug === slug);
    if (hit) return hit;
    if (!APPLY) return { id: null, name, slug, dryRun: true };
    return wcFetch("products/attributes", { method: "POST", body: { name, slug, type: "select", order_by: "menu_order", has_archives: false } });
}

async function ensureAttributeTerm(attrId, name, slug, attrSlug) {
    if (!attrId) return { id: null, name, slug, dryRun: true };
    const existing = await wcFetch(`products/attributes/${attrId}/terms`, { params: { per_page: 100, hide_empty: false } });
    const hit = existing.find(t => t.slug === slug);
    if (hit) return hit;
    if (!APPLY) return { id: null, name, slug, dryRun: true };
    return wcFetch(`products/attributes/${attrId}/terms`, { method: "POST", body: { name, slug } });
}

async function main() {
    console.log(`=== IMPORT MVP ROBLOX === Mode: ${APPLY ? "APPLY (menulis ke WP)" : "DRY-RUN (tidak menulis)"}`);
    const candidates = ONLY_GAME ? draft.candidates.filter(c => c.game === ONLY_GAME) : draft.candidates;
    if (!candidates.length) { console.error(`Game '${ONLY_GAME}' tidak ada di draft.`); process.exit(1); }

    // 1) Kategori "Roblox"
    const catRoblox = await ensureCategory("Roblox", "roblox");
    console.log(`Kategori Roblox: id=${catRoblox.id ?? "(dry-run)"}${catRoblox.dryRun ? " (dry-run)" : ""}`);

    // 2) Global attributes + terms
    for (const c of candidates) {
        for (const a of c.attributes) {
            const slug = a.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
            const attr = await ensureGlobalAttribute(a.name, `pa_${slug}`);
            const termCount = a.options.length;
            let created = 0;
            for (const opt of a.options) {
                const tslug = opt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                const term = await ensureAttributeTerm(attr.id, opt, tslug, attr.slug);
                if (term && !term.dryRun && !term.id) continue;
                created++;
            }
            REPORT.attributes.push({ game: c.game, attribute: a.name, slug: `pa_${slug}`, terms: termCount, dryRun: !APPLY || !!attr.dryRun });
            console.log(`  [attr] ${c.game} / ${a.name} (${termCount} term)`);
        }
    }

    // 3) Products
    if (!ATTRS_ONLY) {
        for (const c of candidates) {
            for (const p of c.products) {
                const body = {
                    name: p.name,
                    slug: p.slug,
                    type: "simple",
                    regular_price: p.regular_price || undefined,
                    sku: p.sku,
                    status: "draft",
                    catalog_visibility: "visible",
                    stock_status: p.stock_status,
                    stock_quantity: p.stock,
                    manage_stock: false,
                    description: p.description,
                    categories: catRoblox.id ? [{ id: catRoblox.id }] : [],
                    attributes: c.attributes.map(a => ({
                        name: a.name,
                        position: 0,
                        visible: a.visible,
                        variation: a.variation,
                        options: a.options,
                    })),
                    meta_data: [
                        { key: "_yasui_source_game", value: p.game },
                        { key: "_yasui_item_type", value: p.item_type },
                        { key: "_yasui_listing_source", value: p.listing_source },
                        { key: "_yasui_mvp_batch", value: draft.generated_at },
                    ],
                };
                if (APPLY) {
                    try {
                        const created = await wcFetch("products", { method: "POST", body });
                        REPORT.products.push({ sku: p.sku, id: created.id, status: "created" });
                        console.log(`  [produk] ${p.sku} -> id=${created.id}`);
                    } catch (e) {
                        // kemungkinan SKU duplikat -> coba cari
                        if (String(e.message).toLowerCase().includes("sku")) {
                            try {
                                const found = await wcFetch("products", { params: { sku: p.sku, per_page: 1 } });
                                REPORT.products.push({ sku: p.sku, id: found[0]?.id ?? null, status: "exists" });
                                console.log(`  [produk] ${p.sku} sudah ada (id=${found[0]?.id})`);
                                continue;
                            } catch {}
                        }
                        REPORT.errors.push({ sku: p.sku, error: e.message });
                        console.error(`  [produk] ${p.sku} GAGAL: ${e.message}`);
                    }
                } else {
                    REPORT.products.push({ sku: p.sku, status: "dry-run" });
                }
            }
        }
    }

    REPORT.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, "roblox-mvp-import-report.json"), JSON.stringify(REPORT, null, 2));
    console.log(`\nSelesai. ${REPORT.products.length} produk, ${REPORT.attributes.length} atribut, ${REPORT.errors.length} error.`);
    console.log(`Report: scratch/roblox-mvp-import-report.json`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
