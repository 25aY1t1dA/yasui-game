# Yasui Game — Headless RMT Gaming Store & Automation Platform

Yasui Game adalah platform *Single-Vendor RMT (Real Money Trading) Game Store* premium untuk penjualan akun game, item, voucher, dan jasa digital (Summoners War: Sky Arena, Roblox Universe, Mobile Legends, dll.).

Dibangun dengan arsitektur **Headless Server-Side Rendering (SSR)** berkecepatan tinggi, integrasi payment gateway tanpa perantara (direct API), sistem otomasi pemenuhan pesanan real-time (*zero-storage account fulfillment*), dan sistem desain taktis **Tactical Precision UI**.

---

## 🛠️ Arsitektur & Teknologi Inti

| Lapisan Sistem | Teknologi / Library | Catatan & Peran |
| :--- | :--- | :--- |
| **Framework Core** | [Astro v5.16.6](https://astro.build/) | Mode Server-Side Rendering (`output: 'server'`) |
| **Hosting & Deployment** | `@astrojs/vercel` / `@astrojs/node` | Vercel Serverless / Node.js runtime |
| **Styling Engine** | **UnoCSS** (`unocss` & `@unocss/astro`) | **Eksklusif:** Proyek hanya menggunakan UnoCSS (Preset Uno, Icons, Typography) |
| **Design System** | Tactical Precision UI | Palet 90-8-2 (Carbon-Alabaster-Cyber Blue), sudut presisi `rounded-md`/`rounded-lg`, `yg-*` shortcuts |
| **Backend & Catalog** | WordPress + WooCommerce REST API v3 | Endpoint terproteksi via `src/lib/wc.js` dengan In-Memory LRU Cache (45-60s) |
| **Payment Gateway** | **Duitku (100% Headless Direct API)** | QRIS Dinamis, Virtual Accounts, E-Wallets, & Kartu Internasional (Visa/MC 3D-Secure) |
| **Game Automation Engine** | Sky Arena Station REST Client | Automasi pemenuhan pesanan Summoners War, sinkronisasi stok SSE, & validasi Hive ID |
| **Security & Middleware** | Astro Middleware (`src/middleware.ts`) | CSRF protection, Zero-Trust backend isolation, strict HTTP security headers |

---

## 📁 Struktur Direktori Repositori

```text
yasui-game/
├── docs/                                 # Dokumentasi arsitektur, API internal & operasional
│   ├── ROBLOX-FILTERS.md                 # Skema & strategi mapping filter Itemku untuk katalog Roblox
│   ├── SKYARENA-API.md                   # Dokumentasi reverse-engineering API SkyArena Station
│   ├── SW-SYSTEM-OVERVIEW.md             # Arsitektur bisnis & alur fulfillment Summoners War
│   ├── SYNC-SW-STOCK.md                  # Panduan operasional sinkronisasi stok Summoners War
│   └── sw-missing-prices.txt             # Daftar 51 monster kolaborasi yang belum memiliki harga
│
├── public/                               # Aset statis publik
│   ├── assets/
│   │   ├── banners/                      # Banner promosi lokal
│   │   ├── games/                        # Cover & thumbnail game resolusi tinggi
│   │   └── SW_Monster/                   # Screenshot monster Summoners War resmi (128 PNG)
│   └── favicon.svg
│
├── scripts/
│   └── maintenance/                      # Skrip CLI maintenance katalog, stok, dan tooling offline
│       ├── fix-sw-images.mjs             # Perbaikan gambar produk SW (screenshot lokal -> swarfarm)
│       ├── game-icons.json               # Database referensi ikon game multi-platform
│       ├── generate-screenshot-manifest.mjs # Generator checklist screenshot monster SW
│       ├── generate-sw-products.mjs      # Generator produk SW (monster × region × tier)
│       ├── icon-auto-updater.mjs         # Sinkronisasi ikon game ke media WordPress
│       ├── import-categories.cjs         # Batch import 1.200+ kategori game ke WooCommerce
│       ├── import-sw-products.mjs        # Import produk SW ke WooCommerce (idempoten by SKU)
│       ├── normalize-roblox-filters.mjs  # Normalisasi skema filter katalog Roblox
│       ├── roblox-filter-jobs.json       # Job referensi mapping filter Roblox
│       ├── roblox-filter-mapping-report.json # Laporan audit filter Roblox
│       ├── roblox-filter-schema.json     # Skema ternormalisasi filter Roblox
│       ├── roblox-filters.json           # Data mentah filter game Roblox
│       ├── roblox-games-with-subs.json   # Direktori 260+ game Roblox & subkategori
│       ├── skyarena-cli.mjs              # Pusat kendali CLI otomasi Summoners War
│       ├── sw-products.csv               # Data produk SW (format CSV untuk review)
│       ├── sw-products.json              # Data 2.196 kombinasi produk SW
│       ├── sw-screenshot-manifest.csv    # Checklist spreadsheet screenshot SW
│       ├── sw-screenshot-manifest.json   # Manifest JSON screenshot SW
│       ├── sw-sync-state.json            # State snapshot stok terakhir SW (±50 KB)
│       ├── sync-sw-stock.mjs             # Worker sync stok SW (Full scan + SSE daemon)
│       ├── validate-roblox-filter-mapping.mjs # Validasi mapping filter Roblox ke WooCommerce
│       └── wc-import-plan.json           # Rencana import kategori WooCommerce
│
├── src/
│   ├── components/                       # Komponen UI Astro
│   │   ├── ui/
│   │   │   └── Icon.astro                # Komponen SVG icon terpadu (WhatsApp, Discord, dll.)
│   │   ├── CatalogSort.astro             # Dropdown sorting katalog (terbaru, harga, terlaris)
│   │   ├── FlashSaleTimer.astro          # Countdown timer flash sale
│   │   ├── FloatingWA.astro              # Floating WhatsApp CTA & drawer CS
│   │   ├── HeroSlider.astro              # Slider promo beranda
│   │   └── RobloxHub.astro               # Direktori game Roblox & quick filters
│   │
│   ├── data/                             # Data internal toko & konfigurasi statis
│   │   ├── Summoners_War_Price_List.csv  # Price list USD resmi Summoners War
│   │   ├── roblox.ts                     # Definisi kategori game & filter Roblox
│   │   └── slides.ts                     # Definisi data banner promosi
│   │
│   ├── layouts/
│   │   └── Layout.astro                  # Master layout: Cyber shell, Header, Search modal,
│   │                                     # Auth modal, LiveChat, Bottom bar, & Footer
│   │
│   ├── lib/                              # Modul backend & utilitas server Astro
│   │   ├── duitku.js                     # Handler Duitku: Signature MD5, Inquiry V2, Callback
│   │   ├── price.js                      # Parser & formatter harga (IDR, USD, MYR, dll.)
│   │   ├── sanitize.js                   # Sanitasi input XSS & pembersihan rich-text HTML
│   │   ├── search.js                     # Algoritma pencarian fuzzy & scoring relevansi
│   │   ├── skyarena-description.js       # Generator deskripsi produk SW
│   │   ├── skyarena-fulfill.js           # Pipeline fulfillment akun SW (lock, sale, set, complete)
│   │   ├── skyarena-pricelist.js         # Parser price list CSV & normalisasi nama monster
│   │   ├── skyarena-stock.js             # Generator SKU, umur tier, & update stok WooCommerce
│   │   ├── skyarena-username.js          # Validator & checker format Hive Com2uS ID
│   │   ├── skyarena.js                   # API Client ke Sky Arena Station (JWT auto-refresh, SSE)
│   │   ├── translations.js               # Kamus lokalisasi multi-bahasa (ID & EN)
│   │   ├── wc.js                         # Klien resmi WooCommerce REST API v3 (cache, retry, auth)
│   │   └── wp.js                         # Re-export alias ke wc.js (deprecated)
│   │
│   ├── pages/                            # Rute halaman toko & SSR API endpoints
│   │   ├── api/
│   │   │   ├── auth/                     # login.js (sesi WP) & set-password.js (terproteksi)
│   │   │   ├── payment/                  # check-status.js (polling IDOR-safe) & duitku-callback.js
│   │   │   ├── sw/                       # set-account/index.js & set-account/status.js
│   │   │   ├── user/                     # orders.js (riwayat transaksi berotentikasi)
│   │   │   ├── create-order.js           # Pembuatan pesanan WooCommerce + payment inquiry
│   │   │   ├── search-categories.js      # Autocomplete pencarian instan kategori
│   │   │   └── submit-review.js          # Pengiriman ulasan pembeli (status hold)
│   │   │
│   │   ├── category/[slug].astro         # Halaman kategori game (filter, sorting, pagination)
│   │   ├── product/[slug].astro          # Halaman produk detail (form order tunggal responsif)
│   │   ├── index.astro                   # Beranda toko
│   │   ├── categories.astro              # Direktori seluruh kategori root game
│   │   ├── cart.astro                    # Keranjang belanja & riwayat lokal
│   │   ├── checkout.astro                # Checkout mandiri
│   │   ├── order-pay.astro               # Pembayaran (QRIS dinamis, VA, kartu 3D-Secure)
│   │   ├── order-success.astro           # Konfirmasi pesanan sukses
│   │   ├── orders.astro                  # Dashboard riwayat pesanan & form Set Account SW
│   │   ├── search.astro                  # Halaman pencarian global
│   │   ├── review.astro                  # Halaman testimoni pembeli
│   │   ├── cara-belanja.astro            # Panduan langkah order
│   │   ├── security-guide.astro          # Panduan keamanan akun & garansi
│   │   ├── terms.astro                   # Syarat & ketentuan layanan
│   │   ├── privacy.astro                 # Kebijakan privasi
│   │   ├── contact.astro                 # Kontak support & CS
│   │   ├── account.astro                 # Redirect ke /orders
│   │   └── img-proxy.js                  # Proxy gambar aman (proteksi SSRF)
│   │
│   ├── scripts/                          # Modul client-side terpisah (modular TypeScript)
│   │   ├── app.ts                        # Master orchestration client via event delegation
│   │   ├── auth.ts                       # Manajemen sesi autentikasi & avatar header
│   │   ├── cart.ts                       # State manajemen keranjang belanja & badge kuantitas
│   │   ├── chat.ts                       # LiveChat drawer & floating trigger
│   │   ├── currency.ts                   # Multi-currency state manager (IDR, USD, MYR, dll.)
│   │   └── search.ts                     # Modal pencarian instan & keyboard navigation
│   │
│   ├── styles/
│   │   └── global.css                    # Styling global, font reset, & utilitas pseudo-element
│   │
│   ├── types/
│   │   └── index.ts                      # Strict TypeScript interfaces untuk seluruh domain toko
│   │
│   └── middleware.ts                     # Astro SSR middleware: CSRF guard & security headers
│
├── .env.example                          # Template konfigurasi environment variables
├── astro.config.mjs                      # Konfigurasi Astro (output: server, Vercel adapter, UnoCSS)
├── GEMINI.md                             # Pedoman arsitektur, standar keamanan & konvensi kode
├── HANDOFF.md                            # Catatan status pengembangan & estafet sesi
├── package.json                          # Dependensi proyek
├── template-email.html                   # Template email transaksi
├── tsconfig.json                         # Konfigurasi TypeScript
└── uno.config.ts                         # Konfigurasi UnoCSS & semantic shortcuts `yg-*`
```

---

## ⚡ Fitur Integrasi Utama

### 1. Otomasi Summoners War: Sky Arena (Zero-Storage Fulfillment)
Sistem end-to-end terintegrasi ke reseller upstream (SkyArena Station):
- **Model Produk:** Monster LD nat5★ × Server (`ASIA`, `GLOBAL`, `EUROPA`) × Tier Umur (`Fresh 1-3 Hari`, `Fresh 4-7 Hari`, `Fresh 8-30 Hari`, `Akun Tua ≥30 Hari`).
- **Zero-Storage:** Database Yasui tidak menyimpan kredensial akun mentah sebelum terjual; akun ditarik dan dikunci secara live saat fulfillment.
- **Fulfillment Pipeline:**
  1. Pembeli menyelesaikan pembayaran (`order status: completed`).
  2. Pembeli memasukkan 3 pilihan Hive ID & 1 password melalui modal di `/orders`.
  3. Endpoint `POST /api/sw/set-account` melakukan verifikasi kepemilikan invoice dan session token.
  4. Server memicu siklus: `buy/lock` (anti-serobot) → `buy/sale` (rekap harga modal ke supplier) → kirim kredensial Hive → verifikasi `buy/complete`.

### 2. Roblox Universe Hub & Smart Filters
- Mengakomodasi 260+ judul game Roblox terpopuler dengan pembagian subkategori terstruktur (Robux, Gamepass, Akun, Item, Mata Uang In-Game).
- Smart filters instan per game tab tanpa perlu reload halaman.

### 3. Headless Payment Gateway (Duitku Direct API)
- **100% Headless:** Pelanggan tidak dialihkan ke halaman Duitku hosted page.
- **Metode Pembayaran:**
  - QRIS Dinamis (generate QR code on-the-fly, auto-refresh status).
  - Virtual Accounts (BCA, Mandiri, BNI, BRI, Permata, CIMB).
  - E-Wallets (DANA, OVO, ShopeePay).
  - Kartu Kredit/Debit Internasional (Visa, Mastercard, JCB dengan 3D-Secure OTP).
- **Polling & Webhook Aman:**
  - Polling status transaksi via `/api/payment/check-status` dilindungi HMAC session / order key (mencegah IDOR enumerasi ID).
  - Webhook `/api/payment/duitku-callback` memvalidasi signature MD5 sebelum mengubah status order.

---

## 🔒 Standar Keamanan Zero-Trust

Sesuai ketetapan di `GEMINI.md`:
1. **Isolasi Total Kredensial:** Seluruh kredensial backend (`WC_CONSUMER_*`, `WP_APP_*`, `DUITKU_*`, `SKYARENA_*`) wajib berjalan di sisi server (SSR). Dilarang menyematkan prefix `PUBLIC_` atau `ASTRO_PUBLIC_`.
2. **Proteksi IDOR & Enumerasi Pesanan:** Akses ke invoice, pembayaran, dan status pemesanan (`/order-pay`, `/order-success`, `/api/payment/check-status`) wajib menyertakan parameter `key` (`order_key` WooCommerce) atau session token customer yang sah.
3. **Anti-SSRF Media Proxy:** `src/pages/img-proxy.js` memblokir akses ke IP private/internal (`127.0.0.1`, `10.*`, `192.168.*`, `169.254.*`) dan hanya mengizinkan domain resmi WordPress backend.
4. **Proteksi Akun:** Penggantian password via `/api/auth/set-password.js` wajib menyertakan bukti autentikasi valid (Session token HMAC, password lama, atau order key verifikasi).
5. **Global HTTP Security Headers:** `src/middleware.ts` menegakkan proteksi `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, dan CSRF token guard.

---

## 🎨 Sistem Desain: Tactical Precision UI (Anti-AI Slop)

Yasui Game menggunakan sistem visual berstandar senior frontend engineer:
- **Rasio Warna 90-8-2:**
  - **90% Matte Carbon & Obsidian:** Canvas `#090A0F`, Card surface `#11131A`, Elevated surface `#161922`, Sub-panel `#0D0F15`.
  - **8% Crisp Metallic & Alabaster:** Heading `#F8FAFC`, Secondary text `#94A3B8`, Muted `#64748B`, Border tegas `1px solid #222634`.
  - **2% Surgical Cyber Blue:** Tombol CTA utama `#00E5FF` / `#38BDF8`, active states, dan badge `INSTANT DELIVERY`.
- **Geometri & Tipografi RMT:**
  - Sudut presisi `rounded-md` (6px) dan `rounded-lg` (8px). Dilarang sudut membulat gemuk `rounded-2xl`/`rounded-3xl`.
  - **Wajib `font-mono tabular-nums`** untuk nominal harga, countdown timer, stok unit, dan Order ID.
- **Clean DOM & Semantic Shortcuts:**
  - Menggunakan shortcuts UnoCSS terpusat: `yg-shell`, `yg-card`, `yg-card-interactive`, `yg-panel`, `yg-input`, `yg-btn-primary`, `yg-product-card`.
  - Dilarang membuat tag `<div>` kosong dekoratif untuk blur/glow (gunakan `.yg-glow-ambient` berbasis CSS pseudo-element).

---

## ⚙️ Variabel Lingkungan (.env)

Salin `.env.example` ke `.env` lalu sesuaikan kredensial server:

```env
# --- WOOCOMMERCE & WORDPRESS BACKEND ---
WP_URL=https://admin.yasuigame.com
WC_CONSUMER_KEY=ck_your_consumer_key_here
WC_CONSUMER_SECRET=cs_your_consumer_secret_here

# --- WORDPRESS APPLICATION PASSWORD (MEDIA / ASSETS PROXY) ---
WP_APP_USER=your_wp_username
WP_APP_PASSWORD=your_application_password_here
WP_USER=your_wp_username
WP_PASS=your_application_password_here

# --- DUITKU PAYMENT GATEWAY (HEADLESS DIRECT API) ---
DUITKU_MERCHANT_CODE=DXXXX
DUITKU_API_KEY=your_duitku_api_key_here
DUITKU_ENV=sandbox

# --- APPLICATION URL ---
APP_URL=http://localhost:4321

# --- SKY ARENA STATION (AUTOMATION FULFILLMENT) ---
SKYARENA_LOGIN_URL=https://visual.skyarenastation.com/login
SKYARENA_EMAIL=your_skyarena_email@example.com
SKYARENA_PASSWORD=your_skyarena_password_here
SW_USD_RATE=18500
```

---

## 🚀 Perintah Menjalankan Proyek

### Development & Build

| Perintah | Deskripsi |
| :--- | :--- |
| `npm install` | Menginstal seluruh dependensi proyek |
| `npm run dev` | Menjalankan local dev server Astro di `http://localhost:4321` |
| `npm run build` | Melakukan build produksi SSR untuk adapter Vercel / Node.js |
| `npm run preview` | Menjalankan preview lokal dari bundle hasil build |

### Tooling Maintenance & Otomasi (`scripts/maintenance/`)

| Perintah | Deskripsi |
| :--- | :--- |
| `node --env-file=.env scripts/maintenance/skyarena-cli.mjs test-login` | Uji koneksi API SkyArena Station & periksa stok per server |
| `node --env-file=.env scripts/maintenance/skyarena-cli.mjs monsters` | Daftar seluruh monster LD nat5 Summoners War |
| `node --env-file=.env scripts/maintenance/skyarena-cli.mjs stock <Monster> <Region>` | Cek ketersediaan akun untuk monster tertentu di region (ASIA, GLOBAL, EUROPA) |
| `node --env-file=.env scripts/maintenance/sync-sw-stock.mjs --once` | Sinkronisasi stok SW ke WooCommerce satu kali (cron-friendly) |
| `node --env-file=.env scripts/maintenance/sync-sw-stock.mjs` | Worker daemon: Sinkronisasi real-time via SSE + full scan berkala 12 jam |
| `node --env-file=.env scripts/maintenance/import-sw-products.mjs --dry-run` | Uji impor katalog produk Summoners War tanpa mengubah data |
| `node --env-file=.env scripts/maintenance/fix-sw-images.mjs` | Audit & pasang foto produk SW yang belum memiliki gambar di WooCommerce |
| `node --env-file=.env scripts/maintenance/icon-auto-updater.mjs --dry` | Audit perubahan ikon game terbaru di katalog kategori |

---

## 📚 Dokumentasi Lanjutan

- [Peta Lengkap API SkyArena Station](file:///Users/unjustice/Market%20/yasui-game/docs/SKYARENA-API.md)
- [Ikhtisar Sistem & Alur Bisnis Summoners War](file:///Users/unjustice/Market%20/yasui-game/docs/SW-SYSTEM-OVERVIEW.md)
- [Panduan Operasional Sinkronisasi Stok SW](file:///Users/unjustice/Market%20/yasui-game/docs/SYNC-SW-STOCK.md)
- [Arsitektur Filter & Normalisasi Roblox](file:///Users/unjustice/Market%20/yasui-game/docs/ROBLOX-FILTERS.md)
- [Standar Keamanan & Arsitektur Sistem Yasui Game](file:///Users/unjustice/Market%20/yasui-game/GEMINI.md)
- [Catatan Status & Estafet Sesi Pengembang](file:///Users/unjustice/Market%20/yasui-game/HANDOFF.md)
