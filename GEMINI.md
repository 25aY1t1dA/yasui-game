# GEMINI.md — Arsitektur & Aturan Operasional Yasui Game

Dokumen ini adalah pedoman arsitektur sistem, peta direktori komprehensif, standar keamanan zero-trust, dan konvensi penulisan kode untuk repositori **Yasui Game**. Semua agen AI dan pengembang wajib membaca dokumen ini sebelum memulai sesi dan mematuhi seluruh ketetapan di bawah ini.

---

## 1. Ringkasan Arsitektur Yasui Game

Yasui Game adalah platform *Single-Vendor RMT (Real Money Trading) Game Store* yang menjual akun game, item, voucher, dan jasa digital (fokus utama: Summoners War: Sky Arena, Roblox Universe, Mobile Legends, dsb.).

### Tech Stack Aktual
- **Framework Core:** [Astro v5.16.6](https://astro.build/) (`output: 'server'`)
- **Deployment & Hosting Adapter:** `@astrojs/vercel` (v8.0.0) / Node.js runtime (`@astrojs/node` v9.5.1)
- **Styling Engine:** **UnoCSS** (`unocss` v66.5.12 & `@unocss/astro` v66.5.12)
  - Presets: `presetUno()`, `presetIcons()` (Lucide icons via `i-lucide-*`), `presetTypography()`
  - Note: Proyek secara mutlak hanya mendukung UnoCSS sebagai utilitas styling frontend.
- **Backend & Catalog Storage:** WordPress + WooCommerce Headless REST API v3
- **Payment Gateway:** Duitku Direct API / Headless Inquiry (QRIS, Virtual Accounts, E-Wallets)
- **Game Automation Engine:** Sky Arena Station REST Client & Fulfillment Worker (`src/lib/skyarena*.js`)
- **Utility & Testing:** `qrcode` (v1.5.4), `playwright` (v1.64.0)

---

## 2. Peta Lokasi File Aktual (`src/`)

Gunakan peta ini untuk navigasi langsung tanpa perlu melakukan pencarian buta (`grep`/`find`).

```
src/
├── assets/
│   ├── astro.svg                         # Asset starter Astro (dead asset)
│   └── background.svg                    # Asset background starter Astro (dead asset)
│
├── styles/
│   └── global.css                        # Style global: UnoCSS base, font-family, reset scrollbar
│
├── layouts/
│   └── Layout.astro                      # Master layout: Cyberpunk theme, JetBrains Mono, Header/Navbar,
│                                         # Search modal, Auth modal, LiveChat widget, Bottom nav, Footer,
│                                         # serta inline client script state manager (cart, auth, currency)
│
├── components/
│   ├── CatalogSort.astro                 # Dropdown aksesibel pengurutan katalog (terbaru, harga, terlaris)
│   ├── FlashSaleTimer.astro              # Banner countdown flash sale (saat ini timer semu midnight)
│   ├── FloatingWA.astro                  # Floating WhatsApp CTA & mobile speed-dial modal
│   ├── HeroSlider.astro                  # Slider banner promosi beranda (komponen statis/unimported)
│   ├── RobloxHub.astro                   # Hub direktori game Roblox, grup layanan & pencarian subkategori
│   └── Welcome.astro                     # Template onboarding default Astro (dead component)
│
├── lib/
│   ├── wc.js                             # Client resmi WooCommerce REST API v3 (CRUD produk, order, customer,
│   │                                     # verifikasi token sesi HMAC-SHA256)
│   ├── wp.js                             # Re-export alias ke wc.js (deprecated)
│   ├── duitku.js                         # Handler Payment Gateway Duitku (inquiry, signature calc, webhook verification)
│   ├── price.js                          # Parser angka harga dari string format WooCommerce (parsePrice)
│   ├── search.js                         # Utilitas pencarian fuzzy & skor kecocokan nama produk/kategori
│   ├── translations.js                   # Kamus lokalisasi multi-bahasa (ID & EN)
│   ├── skyarena.js                       # API Client ke server automation Sky Arena Station (JWT auth)
│   ├── skyarena-stock.js                 # Sinkronisasi stok akun Summoners War (Blessing/Old) ke WooCommerce
│   ├── skyarena-pricelist.js             # Parser daftar harga jual & harga modal SW dari CSV
│   ├── skyarena-fulfill.js               # Pipeline fulfillment otomatis order SW (lock, sale, set-account, complete)
│   ├── skyarena-username.js              # Validator & checker ketersediaan Hive Com2uS ID
│   └── skyarena-description.js           # Generator deskripsi produk HTML/text untuk katalog SW
│
├── pages/
│   ├── index.astro                       # Beranda toko: Banner, Kategori unggulan, Flash sale, Review
│   ├── categories.astro                  # Direktori seluruh kategori root game
│   ├── category/
│   │   └── [slug].astro                  # Halaman arsip game: Filter subkategori, sorting, pagination, search
│   ├── product/
│   │   └── [slug].astro                  # Detail produk: Galeri, variasi tier/server, add-to-cart, buy-now form
│   ├── cart.astro                        # Keranjang belanja & tab riwayat transaksi lokal
│   ├── checkout.astro                    # Halaman checkout mandiri: Form data pemesan & pemilihan metode bayar
│   ├── order-pay.astro                   # Halaman instruksi bayar: Display QRIS dinamis, VA, dan polling status
│   ├── order-success.astro               # Halaman konfirmasi sukses setelah pembayaran terverifikasi
│   ├── orders.astro                      # Dashboard pelacakan invoice & kredensial akun game (terproteksi)
│   ├── search.astro                      # Halaman pencarian global dengan smart filter server & tier
│   ├── review.astro                      # Halaman testimoni pelanggan & modal submit review
│   ├── cara-belanja.astro                # Panduan langkah order dan pembayaran
│   ├── security-guide.astro              # Panduan keamanan pasca-pembelian dan garansi akun
│   ├── terms.astro                       # Syarat dan ketentuan layanan
│   ├── privacy.astro                     # Kebijakan privasi
│   ├── contact.astro                     # Halaman kontak support / CS
│   ├── account.astro                     # Halaman redirect langsung ke /orders
│   ├── img-proxy.js                      # Server-side proxy gambar WordPress (perlu audit keamanan SSRF)
│   │
│   └── api/
│       ├── create-order.js               # POST: Pembuatan pesanan WooCommerce + Request payment inquiry Duitku
│       ├── search-categories.js          # GET: Endpoint pencarian kategori instan dengan in-memory cache
│       ├── submit-review.js              # POST: Pengiriman review produk (status default: hold)
│       ├── auth/
│       │   ├── login.js                  # POST: Verifikasi login customer via WP & penerbitan token sesi
│       │   └── set-password.js           # POST: Set/update password customer (KRITIS: wajib diamankan)
│       ├── payment/
│       │   ├── check-status.js           # ALL: Polling status transaksi ke WooCommerce & Duitku
│       │   └── duitku-callback.js        # POST: Webhook resmi Duitku untuk update status pesanan otomatis
│       ├── sw/
│       │   └── set-account/
│       │       ├── index.js              # POST: Penerimaan Hive ID pembeli & pemicu fulfillment otomatis SW
│       │       └── status.js             # GET: Pengecekan status job antrean fulfillment SW
│       └── user/
│           └── orders.js                 # POST: Fetch riwayat pesanan khusus email pelanggan terautentikasi
```

---

## 3. Standar Keamanan Mutlak (Zero-Trust Headless WooCommerce)

Dalam arsitektur headless, browser klien tidak boleh dianggap terpercaya. Perlindungan data katalog, harga, kredensial backend, dan akun pelanggan harus ditegakkan melalui aturan berikut:

1. **Isolasi Total Kredensial Backend:**
   - Variabel rahasia seperti `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`, `DUITKU_API_KEY`, `DUITKU_MERCHANT_CODE`, `WP_USER`, `WP_PASS`, dan `SKYARENA_*` **dilarang keras** diberi prefix `PUBLIC_` atau `ASTRO_PUBLIC_`.
   - Kredensial ini **dilarang bocor** ke client bundle, tag `<script>`, atribut HTML `data-*`, maupun parameter `define:vars`.
   - **Dilarang keras menyematkan hardcoded fallback keys** di dalam kode sumber (misalnya API key cadangan pada `src/lib/duitku.js` atau fallback string rahasia di `src/lib/wc.js`). Jika environment variable kosong di production, sistem harus melempar error konfigurasi yang eksplisit dan aman.

2. **Server-Side Mediation Wajib:**
   - Browser klien dilarang berkomunikasi langsung ke REST API WordPress/WooCommerce (`/wp-json/wc/v3/*`).
   - Semua mutasi (create order, update order, update password, fetch orders, submit review) **wajib melalui endpoint SSR Astro** di `src/pages/api/*`.
   - Sanitasi input dan validasi tipe data (Zod atau schema manual) wajib dijalankan di level endpoint Astro sebelum meneruskan payload ke WooCommerce.

3. **Verifikasi Hak Akses & Proteksi IDOR (Insecure Direct Object References):**
   - Endpoint sensitif seperti `src/pages/api/payment/check-status.js`, `src/pages/order-pay.astro`, dan `src/pages/order-success.astro` tidak boleh hanya bergantung pada `orderId` publik. Wajib memverifikasi session token atau order key (`order_key`) agar penyerang tidak bisa mengintip pesanan orang lain dengan *ID enumeration*.
   - Endpoint `src/pages/api/auth/set-password.js` wajib memvalidasi sesi pemilik akun atau mengirim tautan konfirmasi token; **dilarang mengizinkan penggantian password sembarangan hanya berbekal parameter email/ID**.

4. **Keamanan Media Proxy (`img-proxy.js`):**
   - Dilarang meneruskan HTTP request ke sembarang URL yang diterima via query parameter (mencegah SSRF - Server-Side Request Forgery).
   - Domain tujuan wajib dibatasi hanya pada domain resmi WordPress backend (`wpDomain` dari `WP_URL`).
   - Dilarang mengirimkan header autentikasi (`Authorization: Basic`) ke URL pihak ketiga yang tidak terdaftar.
   - Hapus instruksi berbahaya seperti `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'`.

---

## 4. Standar Kode Anti-Vibe-Code (Clean DOM & Inspect Element)

Untuk menjaga performa rendering, keterbacaan kode (clean code), dan kemudahan inspeksi browser:

1. **Larangan Menumpuk Utility Classes Mentah:**
   - Dilarang menuliskan rentetan lebih dari 6 utility class mentah berulang kali pada elemen HTML yang sama.
   - Manfaatkan shortcut semantic UnoCSS di `uno.config.ts` atau buat komponen reusable:
     - Contoh: gunakan `.yg-btn-primary`, `.yg-card`, `.yg-badge-cyber` daripada menumpuk `px-4 py-2 bg-cyan-950 border border-cyan-500/40 text-cyan-400 font-mono rounded hover:bg-cyan-900 transition shadow-[...]`.

2. **Larangan Empty `<div>` untuk Efek Dekorasi Visual:**
   - Dilarang membuat tag `<div></div>` kosong semata-mata untuk efek blur, radial gradient, garis neon, atau background glow.
   - Gunakan CSS pseudo-element (`::before`, `::after`), CSS `box-shadow`, atau utility backdrop filter langsung pada container elemen.

3. **Larangan Komentar Boilerplate Khas AI:**
   - Hapus dan dilarang meninggalkan komentar generik seperti:
     - `<!-- Hero Section -->`
     - `<!-- ========================================== -->`
     - `<!-- 1. DESKTOP VIEW: CLASSIC FLOATING WHATSAPP -->`
     - `<!-- Animated Glow Background -->`
     - `<!-- Tooltip (Side) -->`
   - Hanya gunakan komentar kode jika menjelaskan logika bisnis non-trivial atau catatan arsitektural.

4. **Konsolidasi Layout & Penghapusan Markup Duplikat:**
   - Setiap halaman wajib menggunakan wrapper `Layout.astro`. Dilarang menduplikasi tag `<html>`, `<head>`, `<style>`, atau modal popups secara redundan (seperti yang saat ini terjadi pada `checkout.astro`, `order-pay.astro`, `order-success.astro`).
   - Hindari menduplikasi form lengkap untuk mobile dan desktop di halaman yang sama (seperti di `product/[slug].astro`); buat satu markup form yang fleksibel dan responsif secara CSS.

---

## 5. Protokol Estafet Sesi (Session Handoff Protocol)

1. **Awal Sesi (Check-in):**
   - Setiap agen AI yang memulai sesi baru **wajib membaca `GEMINI.md` dan `HANDOFF.md`** sebelum membaca file lain atau mengeksekusi instruksi.
   - Pastikan konteks pekerjaan melanjutkan item prioritas yang tertera pada *Target Sesi Berikutnya* di `HANDOFF.md`.

2. **Akhir Sesi (Check-out):**
   - Sebelum sesi diakhiri, agen **wajib memperbarui `HANDOFF.md`**:
     - Laporkan perubahan yang telah diselesaikan.
     - Catat temuan baru atau utang teknis yang belum terselesaikan.
     - Rumuskan daftar tugas konkret yang siap dieksekusi pada sesi berikutnya.
