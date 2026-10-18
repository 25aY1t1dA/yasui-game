/**
 * TEMPLATE DESKRIPSI PRODUK SUMMONERS WAR
 * Menghasilkan deskripsi HTML/text untuk produk WooCommerce.
 * Anda bisa edit teksnya di sini — generator produk akan memakainya.
 */

const TIER_TEXT = {
    band_1_3: { label: "Fresh 1–3 Hari", blurb: "Akun super fresh, baru dibuat 1–3 hari lalu. Harga tertinggi karena paling diburu dan stok sangat terbatas." },
    band_4_7: { label: "Fresh 4–7 Hari", blurb: "Akun fresh berumur 4–7 hari. Masih tergolong baru dengan harga lebih terjangkau dari band 1–3 hari." },
    band_8_30: { label: "Fresh 8–30 Hari", blurb: "Akun fresh berumur 8–30 hari. Pilihan hemat untuk monster Light/Dark tanpa membayar premium early-day." },
    old: { label: "Akun Tua (≥30 Hari)", blurb: "Akun berumur 30 hari ke atas. Harga flat dan paling ekonomis." },
};

const SERVER_TEXT = {
    ASIA: "Server Asia",
    GLOBAL: "Server Global",
    EUROPA: "Server Eropa",
};

/**
 * Bangun deskripsi produk (HTML) untuk satu produk SW.
 * @param {object} p {monsterName, element, region, tier, naturalStars, crystals, wizardLevel, scrollsSummary, accountCount}
 */
export function buildDescription(p) {
    const tier = TIER_TEXT[p.tier] || TIER_TEXT.old;
    const server = SERVER_TEXT[p.region] || p.region;
    const stars = p.naturalStars || 5;

    const lines = [];
    lines.push(`<p><strong>${p.monsterName} (${p.element}) — ${tier.label} — ${p.region}</strong></p>`);
    lines.push(`<p>${tier.blurb}</p>`);
    lines.push(`<ul>`);
    lines.push(`<li>Monster: <strong>${p.monsterName}</strong> — Natural ${stars}★ ${p.element}</li>`);
    lines.push(`<li>Server: <strong>${server}</strong></li>`);
    lines.push(`<li>Kategori umur: <strong>${tier.label}</strong></li>`);
    if (p.crystals != null) lines.push(`<li>Crystal awal: ±${p.crystals}</li>`);
    if (p.wizardLevel != null) lines.push(`<li>Wizard level: ${p.wizardLevel}</li>`);
    if (p.scrollsSummary) lines.push(`<li>Scroll: ${p.scrollsSummary}</li>`);
    if (p.accountCount != null) lines.push(`<li>Stok tersedia: ${p.accountCount} akun</li>`);
    lines.push(`</ul>`);

    lines.push(`<p><strong>Cara Pengiriman & Set Akun:</strong></p>`);
    lines.push(`<ol>`);
    lines.push(`<li>Selesaikan pembayaran. Pesanan Anda diproses otomatis setelah terverifikasi.</li>`);
    lines.push(`<li>Buka menu <em>Riwayat Order</em> lalu klik tombol <strong>"Set Account Hive ID"</strong>.</li>`);
    lines.push(`<li>Isi <strong>3 opsi username Hive</strong> yang Anda inginkan (6–12 karakter, simbol hanya <code>- _ .</code>). Sistem akan mencoba berurutan sampai ada yang tersedia.</li>`);
    lines.push(`<li>Isi <strong>password</strong> (min. 9 karakter, wajib ada angka & simbol).</li>`);
    lines.push(`<li>Akun akan di-set ke Hive ID Anda dan siap dimainkan.</li>`);
    lines.push(`</ol>`);

    lines.push(`<p><em>Tips: cek ketersediaan username lewat fitur "Forgot Password" di dalam game — jika muncul "ID tidak ditemukan", berarti ID tersebut bisa dipakai.</em></p>`);
    lines.push(`<p><small>Catatan: stok akun fresh sangat cepat berubah karena sistem rebutan antar reseller. Jika stok habis saat diproses, tim kami akan menghubungi Anda untuk opsi pengganti atau refund.</small></p>`);

    return lines.join("\n");
}

/** Deskripsi singkat (excerpt) untuk kartu produk. */
export function buildShortDescription(p) {
    const tier = TIER_TEXT[p.tier] || TIER_TEXT.old;
    return `${p.monsterName} (${p.element}) Natural ${p.naturalStars || 5}★ — ${tier.label} — ${p.region}. Akun Summoners War: Sky Arena, set ke Hive ID Anda.`;
}

/** Ringkasan scroll menjadi teks, misal "36 Unknown Scroll". */
export function summarizeScrolls(scrolls) {
    if (!Array.isArray(scrolls)) return null;
    const parts = scrolls.filter((s) => s && s.quantity > 0).map((s) => `${s.quantity} ${s.name}`);
    return parts.length ? parts.join(", ") : null;
}
