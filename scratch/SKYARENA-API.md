# Sky Arena Station — API Map (Reverse-Engineered)

> Sumber: analisis JS bundle `https://visual.skyarenastation.com` (React SPA).
> Base URL: `https://visual.skyarenastation.com`
> Tanggal eksplorasi: sesi ini.

## Autentikasi
- **Login**: `POST /api/login`
  - Body JSON: `{ "email": "...", "password": "..." }` (field wajib: `email`, bukan `username`)
  - Respons: `{ "access_token": "<JWT>", "token_type": "bearer" }`
  - JWT payload: `{ sub: email, uid: <int>, iat, exp }` — **valid ~24 jam**
- Header untuk semua request terproteksi: `Authorization: Bearer <token>`
- Kredensial diambil dari `.env`: `SKYARENA_EMAIL`, `SKYARENA_PASSWORD`

## KATEGORI AKUN (penting — terkonfirmasi owner)
Website punya **3 kategori akun terpisah** dengan endpoint & meta berbeda. **Jangan tertukar.**

| Kategori | Endpoint list/meta | Umur teramati | Meta khusus | Makna untuk Yasui |
| :--- | :--- | :--- | :--- | :--- |
| **Blessing** | `/api/accounts/blessing/list` `/meta` | 0–30 hari | `day1Count`, `lastHourCount` | **FRESH** — harga bertingkat per umur |
| **Old** | `/api/accounts/old/list` `/meta` | ≥30 hari | `lndCount` | Akun tua, harga flat |
| **Scroll** | `/api/accounts/scroll/list` `/meta` | ~136 hari | fokus `scrolls[]` | Terpisah; sudah ada user/pass Hive. **Dikerjakan paling akhir.** |

- **Aturan website**: akun blessing menginap di blessing-accounts sampai **30 hari**, lalu pindah ke old-accounts.
- Halaman reseller: `/rtsctans/blessing-accounts` (fresh) dan `/rtsctans/old-accounts` (tua).
- **Definisi "fresh" Yasui** = umur ≤7 hari dari `createdServerDate`, dengan harga bertingkat:
  - `band_1_3` (hari 1-3) harga tertinggi, `band_4_7` (hari 4-7), `band_8_30` (hari 8-30) flat, lalu `old` (≥30 hari) flat terpisah.
- Produk = monster LD nat5 × region(ASIA/GLOBAL/EUROPA) × {band_1_3, band_4_7, band_8_30, old}.

## Endpoint Publik-Auth (frontend, prefix `/api`)
| Endpoint | Keterangan |
| :--- | :--- |
| `GET /api/monster-names` | Daftar semua monster (603). Field: `name, unitMasterId, element, elementCode, imageFilename, naturalStars`. **168 nama unik LD nat5**. |
| `GET /api/accounts/scroll/variants` | Varian stok scroll (kombinasi monsterSet × scrollCombo) + `count` stok per varian. |
| `GET /api/accounts/scroll/meta` | Ringkasan: `total, freeTotal, byRegion{EUROPA,GLOBAL,ASIA}, googleCount, guestCount`. |
| `GET /api/accounts/scroll/list?offset&limit&region&...` | Daftar akun (pagination 30). Field akun lihat bawah. |
| `GET /api/accounts/scroll/explorer?variant=...` | Eksplorasi per varian. |
| `GET /api/accounts/scroll/lnd-drilldown?region&unitMasterId&variant` | Drilldown monster LnD spesifik. |
| `GET /api/accounts/scroll/sse` | **SSE stream** (Bearer di header). Event: `{type:"connected", accountType:"scroll"}` + update stok real-time. |
| `GET /api/accounts/blessing/list|meta` | Akun blessing. |
| `GET /api/accounts/old/list|meta` | Akun old. |

### Struktur objek akun (dari `/scroll/list`)
```
uid, wizardName, regionCode(gb/...), regionLabel(GLOBAL/ASIA/EUROPA),
isFreeHive(bool), crystals, wizardLevel,
monsters[], materialMonsters[], scrolls[{id,name,quantity}],
createdKoreanTime, createdServerDate, hasHiveUsername, hasGoogleData
```

## Endpoint Admin (prefix `/api/rtsctans`) — butuh Bearer
| Endpoint | Method | Keterangan |
| :--- | :--- | :--- |
| `/api/rtsctans/accounts/{uid}/set-account/start` | POST | **Mulai job set-account**. Body: `{saleId}`. Respons: `{jobId}`. |
| `/api/rtsctans/set-account/jobs/{jobId}/hive` | POST | **Submit kredensial Hive pembeli**. Body: `{hiveUsername, hivePassword, saleId}`. |
| `/api/rtsctans/set-account/jobs/{jobId}/rebuy-info` | GET | Cek akun masih bisa dibeli (`canBuy`, `reason:"sold"` jika sudah terjual reseller lain). |
| `/api/rtsctans/set-account/buy-locks` | GET | Lock pembelian aktif. |
| `/api/rtsctans/sales-history/{id}/set-account/job-status` | GET | Status job: `awaiting_hive`, `completed`, `failed`, `cancelled`, + `jobSuggestedHiveUsername`. |
| `/api/rtsctans/events/sse?token=<JWT>` | GET (SSE) | **Event stream admin** (token via query param). Event: `{type:"connected", userId, isSuperadmin}` + notifikasi real-time. |
| `/api/rtsctans/sales-history` | GET | Riwayat penjualan. |
| `/api/rtsctans/watchlist` + `/stock` | GET/POST | Watchlist monster + stok. |

## Varian stok (dari `/scroll/variants`)
`monsterSet`: `ld`, `ld_teshar`, dll.
`scrollCombo`: `s160_lo/mid/hi`, `s110_lo/mid/hi` (11Y 160/110 · 12Y <50/50-100/>100).
Region: `ASIA`, `GLOBAL`, `EUROPA`.

## Alur Set Akun & Penjualan (LENGKAP — terkonfirmasi dari JS bundle)
Daftar platform tetap: `Discord, Facebook, G2G, Gameboost, PlayerAuctions, Itemku, Zeusx, Custom`.
Saat pilih **Custom** → ada input teks bebas (diisi "Yasui Game").

**Urutan fulfillment satu akun (uid):**
1. `POST /api/rtsctans/accounts/{uid}/buy/lock` — kunci akun agar tidak diserobot reseller lain. Body: `{saleId?}` / `{}`. (Unlock: `DELETE .../buy/lock`.)
2. `PUT /api/rtsctans/accounts/{uid}/buy/sale` — **catat penjualan**. Body:
   `{saleId, buyerName, platform, price, currency, isPaid}`
   - `platform`: salah satu daftar di atas; untuk Yasui pakai `Custom` + teks "Yasui Game" (perlu konfirmasi apakah platform dikirim sebagai "Custom" atau langsung "Yasui Game").
   - `price`: harga transaksi. **PERLU KONFIRMASI: harga jual (price_*) atau modal (setoran_*).**
   - `currency`: `USD` atau `IDR`. `isPaid`: boolean.
3. `POST /api/rtsctans/accounts/{uid}/set-account/start` — mulai job set-account. Body: `{saleId}`. Respons: `{jobId}`.
4. Poll `GET /api/rtsctans/sales-history/{saleId}/set-account/job-status` sampai `awaiting_hive` (server sarankan `jobSuggestedHiveUsername`).
5. `POST /api/rtsctans/set-account/jobs/{jobId}/hive` — submit kredensial Hive pembeli. Body: `{hiveUsername, hivePassword, saleId}`.
6. Poll status sampai `completed` / `failed`.
7. `POST /api/rtsctans/accounts/{uid}/buy/complete?saleId={saleId}` — tandai akun terjual final (409 = sudah, diabaikan).

**Endpoint pendukung:**
- `GET /api/rtsctans/accounts/{uid}/buy/status` — status lock akun.
- `GET /api/rtsctans/set-account/jobs/{jobId}/rebuy-info` — cek akun masih bisa dibeli (`canBuy:false, reason:"sold"` jika sudah dijual reseller lain).
- `GET /api/rtsctans/sales-history/...` — rekap semua akun yang dijual Yasui Game (platform="Yasui Game").

## Validasi kredensial pembeli (aturan dari owner Yasui)
- **Username Hive**: 6–12 karakter, simbol hanya `-_.`, harus unik (belum dipakai player lain).
- **Password Hive**: minimal 9 karakter, wajib ada angka & simbol.

## Catatan teknis
- SPA memakai SSE untuk push update stok real-time → **tidak perlu polling agresif** untuk monitoring.
- Ada `buy_locks` → mekanisme lock saat proses beli agar tidak rebutan.
- `rebuy-info` mengonfirmasi akun "sold" → ini sinyal untuk auto-update stok Yasui jadi 0/habis.

## Performa (terukur sesi ini)
- **~4-7 detik per request** `/scroll/list` (server lambat). Full scan 1 region (~12.000 akun, 124 halaman) ≈ 3-5 menit dengan concurrency 8.
- Karena itu: **full scan hanya untuk generate/import awal**. Sync rutin memakai **SSE + `/scroll/meta`** (ringan), bukan full scan.
- Data umur akun: `createdServerDate` (YYYY-MM-DD) & `createdKoreanTime`. Per sesi ini seluruh stok berumur 136+ hari (belum ada fresh ≤7 hari).

## Modul yang sudah dibuat (di proyek)
| File | Fungsi |
| :--- | :--- |
| `src/lib/skyarena.js` | Klien API (login JWT auto-refresh, monsters, stock, accounts, SSE listener, set-account) |
| `src/lib/skyarena-stock.js` | Hitung stok fresh/tua dari `createdServerDate`, SKU builder, update stok WooCommerce |
| `src/lib/skyarena-fulfill.js` | Fulfillment order → set akun (validasi username/password, cari kandidat, buy-lock, submit Hive) |
| `scratch/generate-sw-products.mjs` | Generator data produk (JSON+CSV) untuk review → import |
| `scratch/skyarena-cli.mjs` | CLI: test-login, monsters, stock, sync-stock, poll-orders, fulfill, sse |

## Yang masih riset lanjutan
- **Cek availability username via Hive forgot-password**: endpoint tidak terekspos sebagai web publik (hanya di game client / app internal). Perlu reverse-engineering terpisah (Playwright/intercept traffic game). Modul username checker dibuat sebagai antarmuka dulu, implementasi menyusul.
