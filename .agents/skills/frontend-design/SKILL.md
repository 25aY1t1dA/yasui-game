---
name: frontend-design
description: Standard operational guideline for Yasui Game visual design. Enforces Tactical Precision UI (Anti-AI Slop), strict 90-8-2 color distribution, UnoCSS semantic classes, and crisp RMT geometry.
---

# Tactical Precision UI — Standard Desain Yasui Game (Anti-AI Slop)

Dokumen ini adalah pedoman desain antarmuka frontend resmi untuk **Yasui Game**. Semua agen AI dan desainer wajib mematuhi panduan ini dalam membangun atau merombak tampilan antarmuka (UI).

---

## 1. Filosofi Desain: Tactical Precision UI

Yasui Game adalah platform *Single-Vendor RMT (Real Money Trading) Game Store* premium. Karakter visual yang diusung adalah **Tactical Precision UI**: perpaduan antara estetika terminal cyber, ruang operasi digital yang tenang, dan ketegasan alat finansial/trading. 

UI Yasui Game dirancang untuk menginspirasi rasa aman, kecepatan eksekusi, dan kredibilitas profesional, bukan kesan "toko mainan neon" atau "template AI generik".

### Ciri Khas Desain:
1. **Presisi di Atas Dekorasi:** Setiap garis, border, dan badge memiliki makna fungsional. Tidak ada elemen visual yang ada semata-mata sebagai "gimmick pemanis".
2. **Kontras Tinggi & Keterbacaan Kristal:** Angka harga, stok, waktu countdown, dan status pesanan harus dapat dibaca sekilas tanpa distorsi visual.
3. **Tenang & Berwibawa:** Background gelap matte (obsidian/carbon) yang nyaman di mata berjam-jam, dengan aksen warna tajam yang digunakan secara sangat hemat.

---

## 2. Rasio Warna 90-8-2 (Strict Color Distribution)

Semua halaman dan komponen Yasui Game wajib mematuhi aturan distribusi palet warna **90-8-2**:

### A. 90% Matte Carbon & Obsidian (Base Canvas & Surface Architecture)
Warna dasar yang mendominasi 90% area visual antarmuka:
- **Page Canvas / Body Background:** `#090A0F` (Matte Obsidian)
- **Primary Card Surface:** `#11131A` (Carbon Base)
- **Elevated / Hover / Modal Surface:** `#161922` (Elevated Obsidian)
- **Sub-panel / Inset Container Surface:** `#0D0F15` (Deep Inset)

> [!NOTE]
> Permukaan gelap ini tidak boleh flat murahan atau abu-abu pucat. Warna ini menyerap cahaya, menciptakan kontras sempurna bagi teks dan data transaksi.

### B. 8% Crisp Metallic & Alabaster (Legibility, Contrast & Structure)
Warna pembentuk struktur visual, hierarki tipografi, dan pembatas konten:
- **Primary Heading & Value Text:** `#F8FAFC` (Crisp Alabaster / Slate-50) — tingkat kontras maksimal untuk judul produk dan nominal harga.
- **Secondary / Supporting Text:** `#94A3B8` (Metallic Slate / Slate-400) — untuk label atribut, deskripsi singkat, dan breadcrumb.
- **Muted / Timestamp / Caption Text:** `#64748B` (Subtle Slate / Slate-500) — untuk placeholder, helper text, dan tanggal.
- **Structural Border (Wajib 1px Tegas):** `1px solid #222634` (Tear-resistant border yang memisahkan kartu dan panel secara presisi).
- **Subtle Divider / Hairline Rule:** `#1A1D27`

### C. 2% Surgical Cyber Blue & Tactical Indicators (High-Value Focal Points Only)
Aksen tajam yang **HANYA** boleh menempati maksimal 2% dari keseluruhan luas layar:
- **Primary CTA & Active Indicator:** `#00E5FF` (Cyber Blue) / `#38BDF8` (Sky Blue)
  - Digunakan khusus pada: Tombol "Beli Sekarang", step indikator checkout aktif, tab terpilih, dan badge `INSTANT DELIVERY`.
- **Status Taktis Tambahan (Hanya untuk badge status data):**
  - **Success / Terverifikasi / Ready:** `#10B981` (Emerald-500)
  - **Warning / Pending / Limit:** `#F59E0B` (Amber-500)
  - **Danger / Stok Habis / Sold Out:** `#EF4444` (Rose-500)

> [!CAUTION]
> Dilarang membocorkan aksen 2% menjadi latar belakang kartu besar, gradasi teks raksasa, atau cahaya ambient yang membanjiri viewport pengguna!

---

## 3. Aturan Geometri & Tipografi RMT

### A. Aturan Geometri: Presisi & Taktis
- **Radius Sudut Standar:** Gunakan `rounded-md` (6px) untuk tombol kecil, badge, dan input; serta `rounded-lg` (8px) untuk kontainer kartu dan modal dialog.
- **Dilarang Keras Sudut Membulat Gemuk:** Dilarang menggunakan `rounded-2xl` (16px), `rounded-3xl` (24px), atau `rounded-full` pada kartu utama. Sudut yang terlalu bulat merusak nuansa taktis dan membuat antarmuka tampak kekanak-kanakan seperti game kasual mobile.

### B. Tipografi Dual-Role
- **Teks UI & Narasi (Display & Body):**
  - Gunakan font Sans-serif yang tegas, modern, dan bersih (Inter, Plus Jakarta Sans, atau default sans-serif sistem modern).
  - Judul menggunakan *letter-spacing* sedikit rapat (`tracking-tight`) dengan bobot semi-bold (`font-semibold` / `font-bold`).
- **Data Kritis & Nilai Finansial (Wajib Monospace):**
  - **Wajib menggunakan `font-mono tabular-nums`** untuk:
    - Seluruh nominal harga (`Rp 150.000`, `$12.50`)
    - Countdown timer flash sale (`02:14:59`)
    - Jumlah stok akun/item (`Sisa 3 unit`)
    - Order ID & Nomor Invoice (`#YG-20261018-091`)
    - Nomor Virtual Account & Kode Kupon Diskon
  - *Tabular numbers* menjamin lebar karakter digit angka selalu seragam sehingga angka tidak bergeser atau "goyang" saat diperbarui atau saat diurutkan dalam tabel/grid.

---

## 4. Larangan Mutlak: Anti-AI Slop Rules

Untuk menjamin kualitas kode dan DOM sesuai standar senior engineer:

1. **Dilarang Tag `<div>` Kosong untuk Efek Dekoratif:**
   - Dilarang membuat tag `<div class="absolute blur-3xl ..."></div>` untuk membuat glow atau berkas cahaya.
   - Gunakan CSS pseudo-element (`::before`, `::after`), box-shadow terkontrol, atau class semantik `.yg-glow-ambient`.

2. **Dilarang Gradient Text Pelangi:**
   - Dilarang memberi efek `bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500` pada judul halaman atau heading. Gunakan warna solid berbobot (`#F8FAFC`).

3. **Dilarang Glow Neon Berlebihan:**
   - Dilarang menggunakan shadow neon raksasa seperti `shadow-cyan-500/50` atau `shadow-[0_0_50px_rgba(...)]`. Gunakan border tipis `border-cyan-500/40` atau hover transition yang halus.

4. **Dilarang Rentetan Utility Class Mentah:**
   - Dilarang menumpuk lebih dari 6 utility class mentah berulang kali pada elemen HTML yang sama.
   - Gunakan selalu semantic shortcuts `yg-*` yang telah didefinisikan di `uno.config.ts`.

5. **Dilarang Menggunakan TailwindCSS:**
   - Proyek ini **100% menggunakan UnoCSS**. Dilarang menginstal Tailwind atau mengimpor dependensi styling eksternal di luar preset UnoCSS.

6. **Dilarang Komentar Boilerplate AI:**
   - Hapus semua komentar otomatis seperti `<!-- Hero Section -->`, `<!-- DAFTAR ITEM -->`, `<!-- Animated Background -->`. Komentar hanya diperkenankan jika menjelaskan algoritma non-trivial.

---

## 5. Daftar Semantic Shortcuts UnoCSS (`uno.config.ts`)

Gunakan class berikut saat merancang atau memperbarui markup:

| Shortcut Class | Deskripsi Fungsional & Karakter Visual |
| :--- | :--- |
| `yg-shell` | Wrapper batas kontainer halaman toko dengan padding responsif |
| `yg-card` | Kartu obsidian standar (`bg-[#11131A] border border-[#222634] rounded-lg`) |
| `yg-card-interactive` | Kartu interaktif dengan hover elevation, transisi border, dan kursor pointer |
| `yg-card-cyber` | Kartu taktis dengan sudut terpotong presisi dan aksen border khas gaming |
| `yg-panel` | Kontainer sekunder untuk sub-section di dalam halaman atau modal |
| `yg-input` | Elemen input form presisi (`bg-[#0D0F15] border border-[#222634] focus:border-cyan-400 font-mono`) |
| `yg-btn-primary` | Tombol CTA utama (2% Surgical Cyan: `bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-md`) |
| `yg-btn-secondary` | Tombol sekunder obsidian (`bg-[#161922] hover:bg-[#1E2230] text-slate-200 border border-[#222634]`) |
| `yg-btn-danger` | Tombol aksi destruktif atau pembatalan (`bg-rose-500/10 text-rose-400 border border-rose-500/30`) |
| `yg-badge-primary` | Badge penanda utama tema toko (Cyber Blue halus) |
| `yg-badge-cyan` | Badge varian Cyan untuk kategori atau fitur instan |
| `yg-badge-green` | Badge status sukses, produk instock, atau akun fresh |
| `yg-badge-amber` | Badge countdown flash sale, status pending, atau akun lama |
| `yg-badge-red` | Badge stok habis atau peringatan |
| `yg-product-card` | Kontainer produk toko terstandarisasi dengan rasio gambar dan layout presisi |

---

## 6. Checklist Verifikasi Komponen Sebelum Dianggap Selesai

Setiap komponen UI baru atau yang dirombak wajib lulus uji berikut:
- [ ] **Color Check:** Apakah background 90% Matte Carbon/Obsidian? Apakah warna terang hanya menempati 2%?
- [ ] **Font Check:** Apakah angka harga, stok, ID, dan timer sudah memakai `font-mono tabular-nums`?
- [ ] **DOM Check:** Apakah ada `<div>` kosong tanpa konten? Jika ada, hapus dan ubah ke pseudo-element atau CSS.
- [ ] **Class Check:** Apakah ada elemen dengan rentetan > 6 utility class mentah berulang? Jika ya, ganti dengan shortcut `yg-*`.
- [ ] **Responsiveness Check:** Apakah tampilan nyaman di layar mobile 360px - 440px tanpa horizontal scroll yang tidak diinginkan?
- [ ] **Inspect Element Cleanliness:** Apakah struktur DOM terlihat profesional, semantik (`<nav>`, `<header>`, `<main>`, `<article>`, `<section>`, `<footer>`), dan bebas dari jejak AI generatif?
