# Sync Stok Summoners War (SkyArena → WooCommerce)

## Menjalankan

```bash
# Full scan sekali (±5-9 menit) lalu keluar — cocok untuk cron
node --env-file=.env scratch/sync-sw-stock.mjs --once

# Mode daemon: full scan awal + SSE real-time + full scan tiap 12 jam
node --env-file=.env scratch/sync-sw-stock.mjs

# Tanpa SSE (hemat, hanya interval)
node --env-file=.env scratch/sync-sw-stock.mjs --no-sse
```

## Cara kerja
1. **Full scan**: ambil SEMUA akun blessing & old per region (ASIA/GLOBAL/EUROPA)
   → hitung berapa akun per monster LD nat5 × region × tier umur
   → update `stock_quantity` produk WooCommerce by SKU.
2. **SSE**: dengarkan 2 stream real-time (blessing, old). Event masuk → debounce 1 menit
   → re-scan region terkait → update produk region itu saja (lebih cepat dari full scan).
3. **Interval**: full scan penuh tiap 12 jam sebagai jaring aman.
4. **State**: snapshot stok terakhir tersimpan di `scratch/sw-sync-state.json`.

## Stok habis
Produk stok 0 → `stock_status: outofstock` tetap tampil di toko dengan badge "Stok Habis" (SEO).

## Cron (mode --once, contoh tiap 2 jam)
```
0 */2 * * * cd /path/to/yasui-game && node --env-file=.env scratch/sync-sw-stock.mjs --once >> sync.log 2>&1
```

## Aturan deployment
Skrip ini berjalan di lokal/CI/server yang punya akses env (SKYARENA_* + WP_*).
JANGAN jalankan lebih dari satu instance bersamaan (bisa saling timpa stok).
