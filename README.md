# Yasui Game - Premium Gaming Marketplace

Platform marketplace akun game premium dan voucher berbasis web dengan konsep visual **Cyberpunk / Sci-Fi Gaming Dark Mode**. Dibangun dengan arsitektur headless yang cepat, aman, dan modern.

---

## 🛠️ Tech Stack & Konfigurasi Utama

| Komponen | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Framework** | [Astro v5](https://astro.build/) | Mode Server-Side Rendering (`output: 'server'`) |
| **Adapter** | `@astrojs/vercel` | Siap deploy ke Vercel Serverless / Edge |
| **CSS Engine** | **UnoCSS** (`@unocss/astro`) | **Wajib**: Hanya UnoCSS (Preset Uno, Icons, Typography). Dilarang Tailwind. |
| **Icons** | `presetIcons` (Lucide via ESM CDN) | Sintaks: `<div class="i-lucide-[icon-name]"></div>` |
| **Typography** | Google Fonts: `JetBrains Mono` | Font monospace gaming untuk nuansa cyberpunk terminal |
| **Backend CMS** | WordPress + WooCommerce REST API | Endpoint `https://admin.yasuigame.com` via `wc.js` |
| **Payment Gateway** | **Duitku (100% Headless)** | QRIS, VA Bank, E-Wallet (DANA), & Kartu Internasional (Visa/MC 3D-Secure) |
| **Image Proxy** | `/img-proxy?src=...` | Mengatasi CORS / Mixed-Content saat memuat aset gambar dari WordPress |
| **Supply Reseller** | SkyArena Station (reverse-engineered API) | Sumber akun Summoners War: Sky Arena — lihat bagian [Sistem Summoners War](#-sistem-summoners-war--sky-arena-otomatis) |

---

## 📁 Struktur Direktori

```text
yasui-game/
├── public/
│   ├── assets/
│   │   ├── banners/              # Gambar banner slider promo lokal
│   │   ├── games/                # Ikon/cover game resolusi tinggi
│   │   └── SW_Monster/           # 🆕 Screenshot monster SW (owner) — 128 PNG + alias
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── FlashSaleTimer.astro  # Komponen hitung mundur & timer flash sale
│   │   ├── FloatingWA.astro      # Tombol melayang WhatsApp customer service
│   │   └── RobloxHub.astro       # Hub kategori Roblox (direktori game + tab)
│   ├── layouts/
│   │   └── Layout.astro          # Layout global (navbar mobile expandable, dll.)
│   ├── lib/
│   │   ├── duitku.js             # Helper SDK Duitku: Signature MD5, Inquiry V2, Status Check
│   │   ├── price.js              # Parser & formatter harga (IDR, USD, dll.)
│   │   ├── translations.js       # Kamus terjemahan bilingual (ID & EN)
│   │   ├── wc.js                 # Klien WooCommerce REST API & Session HMAC-SHA256
│   │   ├── skyarena.js           # 🆕 Klien API SkyArena (JWT auto-refresh, SSE, set-account)
│   │   ├── skyarena-stock.js     # 🆕 Tier umur akun, SKU builder, update stok WP
│   │   ├── skyarena-pricelist.js # 🆕 Parser price list CSV + koreksi nama monster
│   │   ├── skyarena-fulfill.js   # 🆕 Fulfillment order: buy/lock → sale → set-account → complete
│   │   └── skyarena-description.js # 🆕 Template deskripsi & short description produk SW
│   ├── pages/
│   │   ├── api/
│   │   │   ├── auth/             # login.js & set-password.js
│   │   │   ├── payment/
│   │   │   │   ├── check-status.js    # Polling real-time status transaksi Duitku
│   │   │   │   └── duitku-callback.js # Webhook IPN resmi Duitku
│   │   │   ├── user/             # orders.js (riwayat order by email — kini termasuk SKU per item)
│   │   │   ├── sw/               # 🆕 set-account/index.js (POST) + set-account/status.js (GET)
│   │   │   ├── create-order.js   # Buat order WooCommerce + Inquiry Duitku
│   │   │   ├── search-categories.js # API autocomplete kategori untuk search utama
│   │   │   └── submit-review.js  # Kirim review ulasan pembeli
│   │   ├── category/
│   │   │   └── [slug].astro      # Halaman kategori (Roblox tabs, 🆕 filter SW: server + tier umur)
│   │   ├── product/
│   │   │   └── [slug].astro      # Halaman detail produk (🆕 badge Age Band SW)
│   │   ├── orders.astro          # Riwayat transaksi + 🆕 modal "Set Account Hive ID" (SW)
│   │   └── ...                   # cart, checkout, order-pay, search, review, dll.
│   └── styles/
│       └── global.css            # Utility scrollbar-none & styling global
├── scratch/                      # Data scraping, import plan & tooling
│   ├── SKYARENA-API.md           # 🆕 Peta lengkap API SkyArena (reverse-engineered)
│   ├── SW-SYSTEM-OVERVIEW.md     # 🆕 Dokumen handoff sistem SW (bisnis + alur + spec UI)
│   ├── SYNC-SW-STOCK.md          # 🆕 Cara menjalankan sync stok SW
│   ├── sw-products.json          # 🆕 2.196 kombinasi produk SW (monster × region × tier)
│   ├── Summoners_War_Price_List.csv # 🆕 Price list USD (price_* = jual, setoran_* = modal)
│   ├── sw-missing-prices.txt     # 🆕 51 monster kolaborasi yang di-skip (belum ada harga)
│   ├── sw-screenshot-manifest.csv # 🆕 Checklist screenshot monster
│   ├── import-sw-products.mjs    # 🆕 Import produk SW ke WooCommerce (idempoten by SKU)
│   ├── fix-sw-images.mjs         # 🆕 Perbaiki foto produk SW (screenshot → swarfarm fallback)
│   ├── sync-sw-stock.mjs         # 🆕 Sync stok otomatis: full scan + SSE → WooCommerce
│   ├── sw-sync-state.json        # 🆕 Snapshot stok terakhir (±50 KB, satu-satunya "database")
│   ├── skyarena-cli.mjs          # 🆕 CLI uji: test-login, stock, sync-stock, fulfill, sse
│   ├── itemku-categories.json    # 28 game utama + sub-kategori (verified)
│   ├── roblox-games-with-subs.json # 264 Roblox games + 892 sub-categories
│   ├── wc-import-plan.json       # Struktur lengkap kategori untuk WooCommerce
│   └── import-results.json       # Hasil import ke WooCommerce
├── astro.config.mjs
├── package.json
├── template-email.html
└── uno.config.ts
```

---

## 🆕 Sistem Summoners War: Sky Arena (Otomatis)

Sistem end-to-end untuk menjual akun **Summoners War: Sky Arena** bersumber dari reseller
SkyArena Station (`visual.skyarenastation.com`, API internal hasil reverse-engineering —
dokumentasi lengkap di `scratch/SKYARENA-API.md`).

### Model Produk

Setiap produk = **Monster LD nat5★ × Server (ASIA/GLOBAL/EUROPA) × Tier Umur**:

| Tier | Label | Harga (USD → IDR) |
| :--- | :--- | :--- |
| `band_1_3` | Fresh 1-3 Hari | `price_band_1_3` (termahal) |
| `band_4_7` | Fresh 4-7 Hari | `price_band_4_7` |
| `band_8_30` | Fresh 8-30 Hari | `price_band_7_30` |
| `old` | Akun Tua (≥30 hari) | `price_old` (flat) |

- SKU: `sw-<unitMasterId>-<region>-<tier>` (contoh `sw-23114-asia-band_1_3`)
- Kurs: `SW_USD_RATE` di `.env` (saat ini **18500**); re-run import untuk terapkan kurs baru
- Kategori WP: `summoners-war-sky-arena` (parent) + `sw-akun` (anak)
- Stok tampil = hasil agregasi real-time, **bukan database akun** (zero-storage — akun dicari
  real-time saat fulfillment, tidak disimpan di sisi Yasui)

### Fitur yang Sudah Jalan

| Fitur | Detail |
| :--- | :--- |
| **UI Kategori** (`/category/sw-akun`) | Filter **Server** (Asia/Global/Europe) + **Tier Umur** (Fresh 1-3/4-7/8-30/Old), client-side instan, badge "Stok Habis" (produk tetap tampil demi SEO). Terverifikasi via Playwright. |
| **UI Detail Produk** | Badge Age Band (FRESH hijau / AKUN TUA abu), Server, Element |
| **Fulfillment Otomatis** | Order `completed` → `buy/lock` (anti-serobot) → `buy/sale` (rekap modal, platform "Yasui Game") → `set-account` job → submit kredensial Hive pembeli → `buy/complete` |
| **Form Set Account Hive ID** | Modal di `/orders` untuk order SW completed: 3 opsi username + 1 password, validasi real-time (username 6-12 char `[A-Za-z0-9-_.]`, password min 9 + angka + simbol), polling status otomatis |
| **Import Produk** | `scratch/import-sw-products.mjs` — idempoten by SKU; foto screenshot owner (`public/assets/SW_Monster/`) dengan alias typo + fallback icon swarfarm; 196 produk aktif |
| **Sync Stok** | `scratch/sync-sw-stock.mjs` — full scan (53k akun, ±5 mnt) + SSE real-time (debounced rescan per region) + full scan tiap 12 jam |

### Endpoint API SW

| Endpoint | Fungsi |
| :--- | :--- |
| `POST /api/sw/set-account` | Terima `{orderId, usernames[3], password}` dari pembeli; validasi session + kepemilikan order + status `completed`; simpan ke meta `_sw_set_account`; trigger fulfillment di background |
| `GET /api/sw/set-account/status?orderId&email` | Polling status fulfillment (`awaiting_form` → `processing` → `completed/failed`) |

### Menjalankan Sync Stok

```bash
node --env-file=.env scratch/sync-sw-stock.mjs --once    # full scan sekali (cron-friendly)
node --env-file=.env scratch/sync-sw-stock.mjs           # daemon: SSE + full scan 12 jam
```

⚠️ Jangan jalankan dua instance bersamaan. Detail: `scratch/SYNC-SW-STOCK.md`.

### Testing Tanpa Biaya

Fulfillment **hanya** terpicu dari endpoint server dengan order `completed` milik pembeli
terautentikasi — tidak bisa terpicu dari UI test. Pengujian aman: dry-run import (`--dry-run`),
validasi form (submit tidak dilakukan), dan `GET rebuy-info` (read-only). Uji end-to-end
sungguhan butuh persetujuan owner (akun old $1 = opsi termurah).

### Status SW & Tahap Lanjut

- [x] Reverse-engineer API SkyArena + dokumentasi
- [x] Klien API + tier umur + price list + fulfillment + template deskripsi
- [x] UI kategori (filter server + tier) & detail produk
- [x] Modal Set Account Hive ID + endpoint API + polling status
- [x] Import 196 produk (kurs 18.500, foto, atribut, meta fulfillment)
- [x] Sync stok otomatis (full scan + SSE → WooCommerce)
- [ ] Kategori "scroll" (akun dengan user/pass Hive) — tahap akhir
- [ ] 51 monster kolaborasi (Frieren, Gojo, dll.) — menunggu harga dari owner
- [ ] 5 monster perlu screenshot owner: Old Wood (Light/Dark), Rick (Dark), Night Fang (Dark), Elder Horn (Light)
- [ ] Opsional: cap stok tampil maks 50 unit per produk (sanitas merchandising)

---

## 🆕 Perubahan Sesi Lainnya (2025)

### 1. UX Mobile Navbar Remodeling
**File:** `src/layouts/Layout.astro`

- Search bar mobile dipindah ke baris kedua expandable (auto-focus, auto-collapse saat scroll, icon toggle 🔍 ↔ ✕). Desktop tidak berubah.

### 2. Logo Mobile Diperbesar
Ukuran logo mobile `text-xs` → `text-base`; tablet+ `text-lg`.

### 3. Fix Category Parent Breadcrumb Error
**File:** `src/pages/category/[slug].astro`

- Bug `Cannot read properties of undefined (reading 'toUpperCase')` — WooCommerce hanya mengembalikan `parent` sebagai ID. Kini parent di-resolve via fetch tambahan.

### 4. Search Utama → Autocomplete Kategori
**Files:** `src/layouts/Layout.astro`, `src/pages/api/search-categories.js`

- Search hanya mencari **kategori/game** (bukan produk), dropdown suggestion dengan keyboard navigation, debounce 250ms, cache 60 detik.

### 5. Struktur Kategori Multi-Level (itemku Model)
Meniru itemku.com: Roblox → Game → Tipe; Growtopia → Tipe; breadcrumb bertingkat; parent menampilkan grid sub-kategori.

### 6. Tab UI untuk Kategori Roblox
Tab "🎮 PILIH GAME" (grid game) vs "💎 ROBUX & AKUN" (pills Robux/Gift Card/Akun).

### 7. Import WooCommerce
**1.223 kategori** berhasil diimport (0 error). Detail `scratch/import-results.json`.

---

## ⚙️ Variabel Lingkungan (.env)

```env
# --- WOOCOMMERCE & WORDPRESS BACKEND ---
WP_URL=https://admin.yasuigame.com
WC_CONSUMER_KEY=ck_xxx
WC_CONSUMER_SECRET=cs_xxx
WP_APP_USER=xxx
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx   # utk upload media (foto produk SW)

# --- DUITKU PAYMENT GATEWAY (HEADLESS) ---
DUITKU_MERCHANT_CODE=DS27852
DUITKU_API_KEY=xxx
DUITKU_ENV=sandbox

# --- APP BASE URL ---
APP_URL=http://localhost:4321

# --- SKYARENA (SUMMONERS WAR) ---
SKYARENA_EMAIL=reseller@email.com
SKYARENA_PASSWORD=xxx
SW_USD_RATE=18500            # kurs USD → IDR utk harga produk SW
```

---

## 💳 Arsitektur Headless Payment Gateway (Duitku)

Seluruh alur checkout dan pembayaran **100% Headless**:

1. **Pembuatan Pesanan (`/api/create-order`)**: Cart → WooCommerce Order → Duitku Inquiry → Return `/order-pay?id=X` + session token
2. **Halaman Pembayaran (`/order-pay?id=...`)**: QRIS Dinamis, VA Interaktif, Kartu 3D-Secure, Timer 15 menit, Real-time polling setiap 4 detik, Auto-redirect ke `/order-success`
3. **Metode Internasional**: Visa/MC/JCB aktif dengan 3D-Secure OTP. Crypto USDT/USDC (roadmap). PayPal sengaja ditiadakan (risiko chargeback RMT).

---

## 🚀 Perintah Menjalankan Proyek

| Perintah | Deskripsi |
| :--- | :--- |
| `npm install` | Install seluruh dependensi |
| `npm run dev` | Dev server di `http://localhost:4321` |
| `npm run build` | Build produksi SSR untuk Vercel |
| `npm run preview` | Preview lokal hasil build |

---

## 🎨 Panduan Gaya Desain (Design System)

1. **Aturan Wajib**: Hanya UnoCSS. Dilarang Tailwind.
2. **Palet Warna**:
   - Background: `#050505` + grid overlay `rgba(34, 211, 238, 0.05)`
   - Aksen Primer: Neon Cyan (`#22d3ee` / `cyan-400`)
   - Aksen Deal/Expired: Red (`#ef4444` / `red-500`)
   - Kartu: `bg-gray-900/60` + `border-gray-800/80` + `hover:border-cyan-400`
3. **Komponen Khas**:
   - `.cyber-card`: Sudut terpotong diagonal (clip-path)
   - Glow: `shadow-[0_0_15px_rgba(34,211,238,0.25)]`
   - Monospace: `JetBrains Mono` untuk data, harga, nomor VA
   - Tab pills: `skew-x-[-10deg]` dengan counter-skew pada child

---

## 💡 Arsitektur Alur & State Management

1. **Katalog & Data Flow**: WooCommerce REST API (`lib/wc.js`) SSR → `normalizeProduct()`
2. **Keranjang**: `localStorage.yasui_cart`, sync badge via `storage` event
3. **Auth**: Session 30 hari `localStorage.yasui_session` dengan HMAC-SHA256 token
4. **Search**: Autocomplete kategori via `/api/search-categories` → redirect ke halaman kategori
5. **Multi-Currency & i18n**: Server-side Geo-IP via Vercel header, auto-detect IDR/USD + ID/EN
6. **Fulfillment SW**: Order completed (SKU `sw-*`) → pembeli isi form Set Account Hive ID → fulfillment otomatis ke SkyArena → status tampil di Riwayat Order

---

## 📌 TODO Umum (Non-SW)

- [ ] **Produk mapping** — assign produk existing ke sub-kategori yang benar
- [ ] **Search produk per sub-kategori** — fitur pencarian produk di dalam halaman sub-kategori
- [ ] **Filter & sorting** di halaman sub-kategori (harga, terbaru, terlaris)
- [ ] **Upload icon/gambar** untuk setiap kategori baru di WordPress
- [ ] **SEO** — meta description untuk setiap halaman kategori baru
- [ ] **Sitemap update** — pastikan semua URL kategori baru ter-index
- [ ] **Cleanup duplikat** — merge kategori lama `robux-gift-card` (id:48) ke `robux-game-card` (id:142)
- [ ] **Search backend** — untuk katalog besar, pindahkan pencocokan katalog ke indeks pencarian backend

---

## 📌 Catatan Khusus & Batasan Proyek

* **Stabilitas Desain**: Banner promo carousel, kartu produk rekomendasi admin, dan flash sale adalah rancangan final.
* **Fokus Optimasi**: Responsivitas mobile (360px - 440px), tombol tidak saling menutupi, bottom bar nyaman satu tangan.
* **Pagination**: Sub-kategori di `[slug].astro` menggunakan pagination (per_page=100) untuk handle kategori dengan banyak children seperti Roblox (270+).
* **Duplikat Kategori**: Ada kategori lama `robux-gift-card` (id:48, 3 produk) yang belum di-merge ke `robux-game-card` (id:142). Perlu dipindahkan manual di WordPress admin.
* **Zero-Storage SW**: Sistem SW tidak menyimpan database akun SkyArena — hanya angka agregasi stok (`sw-sync-state.json` ±50 KB). Akun dicari real-time saat fulfillment.
* **SkyArena Rate**: Server SAS lambat (4-7 dtk/request) — full scan hanya untuk import/sync awal; sync rutin via SSE.
