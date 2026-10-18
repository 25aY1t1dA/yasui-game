#!/usr/bin/env node
/**
 * SKYARENA CLI — pusat kendali otomasi Summoners War
 *
 * Pemakaian (dari root proyek):
 *   node --env-file=.env scripts/maintenance/skyarena-cli.mjs <command>
 *
 * Commands:
 *   test-login                      Uji login & tampilkan meta stok
 *   monsters                        Daftar monster LD nat5 (untuk produk)
 *   stock <monster> <region>        Cek stok akun untuk monster di region
 *   sync-stock [--dry-run]          Sinkronkan stok SkyArena -> WooCommerce
 *   poll-orders                     Poll order completed SW & proses (loop)
 *   fulfill <unitMasterId> <region> <tier> <username> <password>
 *                                   Uji fulfillment manual satu akun (HATI-HATI: live)
 *   sse                             Dengarkan SSE stok real-time
 */

import * as sky from "../../src/lib/skyarena.js";
import * as stock from "../../src/lib/skyarena-stock.js";
import * as fulfill from "../../src/lib/skyarena-fulfill.js";

const [cmd, ...args] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    switch (cmd) {
        case "test-login": {
            const meta = await sky.getScrollMeta();
            console.log("✅ Login OK. Stok per region:", JSON.stringify(meta.byRegion));
            console.log(`   total=${meta.total} freeTotal=${meta.freeTotal} google=${meta.googleCount} guest=${meta.guestCount}`);
            break;
        }
        case "monsters": {
            const ld = await sky.getLdNat5Monsters();
            const names = [...new Map(ld.map(m => [String(m.unitMasterId), m])).values()];
            console.log(`LD nat5 (${names.length}):`);
            names.forEach(m => console.log(`  ${m.unitMasterId}\t${m.name} (${m.element})`));
            break;
        }
        case "stock": {
            const [name, region = "ASIA"] = args;
            const ld = await sky.getLdNat5Monsters();
            const m = ld.find(x => x.name.toLowerCase() === String(name).toLowerCase());
            if (!m) { console.log(`Monster "${name}" tidak ditemukan.`); break; }
            const n = await sky.countAccountsWithMonster({ region: region.toUpperCase(), unitMasterId: m.unitMasterId });
            console.log(`${m.name} (${m.element}) @ ${region.toUpperCase()}: ${n} akun`);
            break;
        }
        case "sync-stock": {
            const dry = args.includes("--dry-run");
            console.log(dry ? "DRY-RUN sync stok..." : "Sync stok LIVE...");
            const snap = await stock.buildStockSnapshot({ onProgress: (m) => console.log("  " + m) });
            const ids = Object.keys(snap);
            console.log(`\n${ids.length} monster punya stok. Contoh 5:`);
            ids.slice(0, 5).forEach(id => console.log(`  ${id}:`, JSON.stringify(snap[id])));
            if (!dry) console.log("\n(Upload ke WooCommerce belum diaktifkan — menunggu konfirmasi struktur produk final.)");
            break;
        }
        case "poll-orders": {
            const catId = await fulfill.getSwCategoryId();
            console.log(`Kategori SW id=${catId}. Polling order completed (Ctrl+C untuk berhenti)...`);
            const seen = new Set();
            for (;;) {
                try {
                    const orders = await fulfill.getCompletedSwOrders({ categoryId: catId });
                    for (const o of orders) {
                        if (seen.has(o.id)) continue;
                        seen.add(o.id);
                        console.log(`\nOrder #${o.id} completed:`);
                        (o.line_items || []).forEach(li => console.log(`  - ${li.name} (sku: ${li.sku || "-"})`));
                        // TODO: baca username+password dari order meta lalu panggil fulfillSwAccount
                    }
                } catch (e) { console.error("poll error:", e.message); }
                await sleep(15000);
            }
        }
        case "fulfill": {
            const [umid, region, tier, user, pass] = args;
            if (!umid || !region || !tier || !user || !pass) { console.log("Argumen kurang. Lihat header."); break; }
            console.log("⚠️  LIVE fulfillment — akan set akun sungguhan.");
            const res = await fulfill.fulfillSwAccount({
                unitMasterId: umid, region: region.toUpperCase(), tier,
                hiveUsername: user, hivePassword: pass,
                onStatus: (s) => console.log("  status:", s),
            });
            console.log("✅ Hasil:", JSON.stringify(res));
            break;
        }
        case "sse": {
            console.log("Dengarkan SSE stok (Ctrl+C berhenti)...");
            sky.listenScrollSse(
                (ev) => console.log("event:", JSON.stringify(ev)),
                { onError: (e) => console.error("sse error:", e.message) }
            );
            await new Promise(() => {}); // jalan terus
        }
        default:
            console.log("Command tidak dikenal. Lihat header file untuk daftar command.");
    }
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
