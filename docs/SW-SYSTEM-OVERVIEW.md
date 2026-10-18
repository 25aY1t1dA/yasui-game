# Summoners War: Sky Arena — Gambaran Sistem & Kebutuhan UI

> Dokumen handoff untuk AI Agent yang mengerjakan **UI/frontend**.
> Berisi konteks bisnis, model data, alur sistem backend (sudah selesai dibangun),
> dan spesifikasi UI yang harus dibuat. Baca dokumen ini bersama `scratch/SKYARENA-API.md`
> (peta API lengkap) dan `README.md` (tech stack & design system proyek).

---

## 1. Konteks Bisnis

Yasui Game menjual akun **Summoners War: Sky Arena (SW)** yang bersumber dari platform reseller
`visual.skyarenastation.com` (SkyArena). SkyArena **tidak punya API resmi**, tetapi API internalnya
sudah berhasil di-reverse-engineer dan modul backend-nya **sudah selesai dibangun** (lihat bagian 4).

Masalah yang dipecahkan sistem ini:
1. **Set akun manual** — selama ini jika akun terjual, data akun harus di-set manual ke pembeli. Sekarang otomatis.
2. **Stok rebutan antar reseller** — akun fresh diperebutkan banyak reseller; tidak ada notifikasi jika habis. Sekarang stok disinkronkan otomatis ke WooCommerce, dan akun di-**lock** begitu pembayaran sukses agar tidak diserobot.

---

## 2. Model Data Produk

Setiap produk SW = kombinasi **Monster × Server × Tier Umur**.

### Monster
- Hanya monster **Light & Dark natural-5★** (183 unit / 168 nama unik) dari endpoint `/api/monster-names`.
- Setiap monster punya `unitMasterId`, `element` (Light/Dark), `imageFilename`.
- 51 monster (kebanyakan kolaborasi: Frieren, Geralt, Gojo, dll.) **di-skip dulu** karena belum ada harga — daftar di `scratch/sw-missing-prices.txt`.

### Server (region)
`ASIA` | `GLOBAL` | `EUROPA`

### Tier Umur (berdasarkan `createdServerDate` akun)
| Tier key | Label | Sumber kategori SkyArena | Harga |
| :--- | :--- | :--- | :--- |
| `band_1_3` | Fresh 1–3 Hari | blessing | `price_band_1_3` (termahal) |
| `band_4_7` | Fresh 4–7 Hari | blessing | `price_band_4_7` |
| `band_8_30` | Fresh 8–30 Hari | blessing | `price_band_7_30` (di CSV) |
| `old` | Akun Tua (≥30 hari) | old | `price_old` (flat) |

> Aturan SkyArena: akun blessing menginap maks 30 hari lalu pindah ke kategori old.
> Kategori ketiga "scroll" (akun sudah ada user/pass) dikerjakan paling akhir — **di luar scope UI saat ini**.

### Harga (price list: `scratch/Summoners_War_Price_List.csv`)
- `price_*` = **harga jual** yang tampil di toko.
- `setoran_*` = harga modal (dipakai internal saat rekap penjualan ke SkyArena, **jangan tampilkan**).
- Parser + koreksi salah-eja nama: `src/lib/skyarena-pricelist.js` → `getPricesForMonster(name)`.

### Konvensi penamaan
- **SKU**: `sw-<unitMasterId>-<region>-<tier>` → contoh `sw-23114-asia-band_1_3`
- **Nama produk**: `{Monster} ({Element}) — {REGION} — {Tier Label}` → contoh `Lucifer (Light) — ASIA — Fresh 1–3 Hari`
- **Slug**: `<slug-monster>-<element>-<region>-<tier>`
- **Foto produk** (screenshot manual oleh owner): `public/assets/games/sw/<slug-monster>-<element>.png`
  → contoh `lucifer-light.png`. Checklist: `scratch/sw-screenshot-manifest.csv`.
  - Fallback sementara: icon 100×100 dari `https://swarfarm.com/static/herders/images/monsters/<imageFilename>` (bisa lewat `/img-proxy` proyek atau `proxy-image` SkyArena tanpa auth).

### Deskripsi produk
Template otomatis sudah ada: `src/lib/skyarena-description.js` → `buildDescription(p)` (HTML) &
`buildShortDescription(p)`. Sudah memuat info monster, server, tier, dan **instruksi Set Account Hive ID**.
UI tinggal merender `description` / `short_description` dari produk WooCommerce seperti biasa.

---

## 3. Alur Sistem End-to-End

```
┌─ PEMBELI ─────────────────────────────────────────────────────────────┐
│ 1. Buka kategori "Summoners War: Sky Arena" (ID 18, slug              │
│    summoners-war-sky-arena)                                           │
│ 2. Filter server (Asia/Global/Europa) + pilih tab tier umur           │
│    (Fresh 1-3 / 4-7 / 8-30 / Old)                                     │
│ 3. Pilih produk monster → checkout → bayar via Duitku                 │
└────────────────────────────────────────────────────────────────────────┘
                                 │ pembayaran SUKSES (order → completed)
                                 ▼
┌─ BACKEND (sudah dibangun, jalan lokal) ───────────────────────────────┐
│ 4. buy/lock    → akun fresh DIKUNCI detik ini juga (anti-serobot)      │
│ 5. buy/sale    → penjualan tercatat di SkyArena                        │
│                  {platform:"Yasui Game", price:harga modal, USD, paid} │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─ PEMBELI (UI YANG HARUS DIBANGUN) ────────────────────────────────────┐
│ 6. Buka Riwayat Order → tombol "Set Account Hive ID" → modal form:    │
│    - 3 opsi username Hive (dicoba berurutan sampai ada yang available)│
│    - 1 password                                                       │
│    - note: cek ketersediaan username via Forgot Password di in-game   │
│      (karena akun SUDAH ter-lock, pembeli tidak diburu-buru waktu)    │
└────────────────────────────────────────────────────────────────────────┘
                                 │ submit form
                                 ▼
┌─ BACKEND ─────────────────────────────────────────────────────────────┐
│ 7. set-account: start → poll "awaiting_hive" → submit username+pass   │
│    (coba opsi username 1→2→3 sampai diterima)                          │
│ 8. buy/complete → akun resmi terjual, terekap di SkyArena              │
│ 9. Status tampil di Riwayat Order pembeli (sukses + username final)   │
└────────────────────────────────────────────────────────────────────────┘
```

### Sync stok (berjalan terpisah)
- SSE real-time `/api/accounts/{blessing,old}/sse` + polling ringan → update
  `stock_quantity` & `stock_status` produk WooCommerce. **Stok habis = produk tetap
  tampil dengan label "Stok Habis"** (jangan disembunyikan — SEO & link).

---

## 4. Modul Backend yang SUDAH ADA (jangan dibuat ulang)

| File | Isi | Fungsi kunci untuk UI |
| :--- | :--- | :--- |
| `src/lib/skyarena.js` | Klien API SkyArena (JWT auto-refresh) | `getAccounts(type,{region,...})`, `getAccountMeta(type)`, `getLdNat5Monsters()` |
| `src/lib/skyarena-stock.js` | Umur & tier | `AGE_BANDS`, `ageBand(acc)`, `FRESH_MAX_DAYS=7` |
| `src/lib/skyarena-pricelist.js` | Harga | `getPricesForMonster(name)` → `{price, setoran}` |
| `src/lib/skyarena-fulfill.js` | Fulfillment order | `fulfillSwAccount(...)`, `validateHiveUsername(u)`, `validateHivePassword(p)` |
| `src/lib/skyarena-description.js` | Template deskripsi | `buildDescription(p)`, `buildShortDescription(p)` |
| `scratch/SKYARENA-API.md` | Peta endpoint lengkap | referensi |
| `scratch/sw-products.json/.csv` | 2.196 data produk (stok snapshot) | referensi import |
| `scratch/skyarena-cli.mjs` | CLI uji (`test-login`, `stock`, `fulfill`, `sse`) | debugging |

### Validasi form (WAJIB dipakai di UI, sama dengan backend)
- **Username Hive**: 6–12 karakter; hanya huruf/angka + `- _ .` (regex: `/^[A-Za-z0-9\-_.]{6,12}$/`)
- **Password**: min 9 karakter, wajib ≥1 angka & ≥1 simbol
- Kedua fungsi validator bisa di-import dari `src/lib/skyarena-fulfill.js` untuk validasi client-side.

---

## 5. Spesifikasi UI yang Harus Dibangun

### A. Halaman kategori Summoners War — `src/pages/category/summoners-war-sky-arena` (atau via `[slug].astro`)
Mengikuti pola halaman kategori yang sudah ada (breadcrumb, kartu produk cyberpunk), plus:
1. **Filter server**: 3 opsi — ASIA / GLOBAL / EUROPA (default: ASIA atau semua). Bisa berupa tab pills miring (`skew-x-[-10deg]`) sesuai design system.
2. **Tab tier umur**: 4 tab — **Fresh 1–3 Hari | Fresh 4–7 Hari | Fresh 8–30 Hari | Akun Tua**.
   - Tab hanya menampilkan produk dengan tier terkait (filter by SKU suffix atau kategori/meta produk).
   - Monster tanpa stok di tab aktif tetap tampil dengan badge **"Stok Habis"**.
3. **Grid produk monster**: kartu berisi foto monster, nama, elemen (icon Light/Dark), harga (`price_*`), badge stok.
4. **Search/filter lokal** opsional mengikuti pola kategori lain (lihat `RobloxHub.astro` sebagai referensi tab + direktori).

### B. Halaman detail produk — `src/pages/product/[slug].astro`
- Tampilkan foto, nama, elemen, server, tier, harga, deskripsi (dari template), tombol add-to-cart (pola existing).
- Badge umur akun (misal "Fresh 1–3 Hari") dan info stok.

### C. Form "Set Account Hive ID" — di halaman Riwayat Order (`src/pages/orders.astro`)
**Ini inti fulfillment dari sisi pembeli.**
1. Untuk order completed yang berisi produk SW (SKU prefix `sw-`) dan belum di-set → tampilkan tombol **"Set Account Hive ID"**.
2. Klik tombol → **modal** berisi:
   - **3 field username** (Opsi 1 wajib, Opsi 2 & 3 cadangan). Validasi real-time per aturan di atas.
   - **1 field password** + toggle show/hide. Validasi real-time.
   - **Note informatif**: *"Cek ketersediaan username melalui fitur Forgot Password di dalam game — jika muncul 'ID tidak ditemukan', berarti ID bisa dipakai. Akun Anda sudah diamankan, jadi tidak perlu terburu-buru."*
   - Tombol submit (disabled sampai valid).
3. Submit → endpoint API (akan dibuat terpisah, misal `POST /api/sw/set-account`) yang menyimpan
   kredensial ke order meta lalu memicu `fulfillSwAccount()`.
4. **Status fulfillment di kartu order**: `Menunggu form` → `Memproses` → `Selesai (tampilkan username final)` / `Gagal (hubungi CS)`.

### D. Endpoint API pendukung (perlu dibuat, mengikuti pola `src/pages/api/`)
- `POST /api/sw/set-account` — terima `{orderId, usernames[3], password}`, validasi session, simpan ke order meta, trigger fulfillment.
- `GET /api/sw/set-account/status?orderId=...` — polling status fulfillment untuk UI.
- (Opsional) `GET /api/sw/username-check` — placeholder; saat ini selalu mengembalikan "belum dapat diverifikasi" (cek availability asli via Hive masih riset — lihat SKYARENA-API.md).

---

## 6. Batasan & Catatan Penting untuk Agent UI

1. **Jangan ubah** modul backend `src/lib/skyarena*.js` — sudah teruji. Cukup import & pakai.
2. **Design system wajib**: UnoCSS only (dilarang Tailwind), tema cyberpunk dark (`#050505`, aksen cyan `#22d3ee`, font JetBrains Mono, `.cyber-card` clip-path, glow `shadow-[0_0_15px_rgba(34,211,238,0.25)]`). Lihat `README.md`.
3. **Responsif mobile dulu** (360–440px) — prioritas proyek.
4. Kredensial/rahasia hanya di `.env`, **jangan pernah** kirim ke client. Semua panggilan SkyArena/WooCommerce lewat endpoint server (`src/pages/api/`), bukan dari browser.
5. Stok & harga berasal dari produk WooCommerce (SSR via `wc.js`) — UI tidak memanggil SkyArena langsung.
6. Produk "Stok Habis" tetap tampil (tidak disembunyikan).
7. Kategori "scroll" & 51 monster kolaborasi **di luar scope** saat ini.

---

## 7. Status Pengerjaan Keseluruhan

- [x] Reverse-engineer API SkyArena + dokumentasi
- [x] Klien API + login JWT auto-refresh
- [x] Model tier umur (3 band fresh + old) dari `createdServerDate`
- [x] Price list + koreksi nama
- [x] Modul fulfillment lengkap (buy/lock → sale → set-account → complete)
- [x] Template deskripsi produk
- [x] Manifest screenshot + struktur folder
- [ ] **UI kategori (filter server + tab tier)** ← dikerjakan owner/agent
- [ ] **UI form Set Account Hive ID + modal** ← dikerjakan agent UI
- [ ] Endpoint API `/api/sw/set-account` + status
- [ ] Import produk final ke WooCommerce (gabung data + harga + deskripsi + foto)
- [ ] Skrip sync stok otomatis (SSE + meta → WooCommerce)
- [ ] Kategori "scroll" & harga monster kolaborasi (tahap akhir)
