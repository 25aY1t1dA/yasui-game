/**
 * SEED PRODUK SAMPEL SHOWCASE KE WORDPRESS / WOOCOMMERCE
 *
 * Memindai seluruh hierarki kategori game (baik Roblox maupun Non-Roblox seperti MLBB,
 * Genshin, Blue Archive, Arknights, dll.) di WooCommerce yang masih memiliki 0 produk.
 * Menggunakan endpoint resmi /products/batch untuk menyuntikkan produk sampel ber-SKU DEMO-*
 * secara cepat dan andal agar seluruh tab kategori langsung memiliki produk nyata.
 *
 * Fitur:
 * - Memindai 100% taksonomi WooCommerce secara dinamis
 * - Menghasilkan produk kontekstual sesuai tipe subkategori (Akun, Top Up, Gamepass, Item, Joki, Gift)
 * - Menyematkan kategori hierarkis lengkap (Roblox Root + Game + Sub-Kategori)
 * - Menggunakan WooCommerce Batch API (/products/batch) dengan chunk 50 item per request
 * - Idempoten: Cek demo produk eksisting terlebih dahulu sebelum injeksi
 * - Mode Pembersihan Cepat (--clean-demo): Menghapus seluruh produk sampel via batch delete dalam hitungan detik
 *
 * Penggunaan:
 *   node --env-file=.env scripts/maintenance/seed-showcase-products.mjs
 *   node --env-file=.env scripts/maintenance/seed-showcase-products.mjs --clean-demo
 */

import { wcFetch, clearWcCache } from "../../src/lib/wc.js";

const args = process.argv.slice(2);
const IS_CLEAN = args.includes("--clean-demo");

// Curated Showcase Products (Blox Fruits & MLBB) dengan data sangat rinci
const CURATED_SHOWCASE_PRODUCTS = [
    // --- 1. BLOX FRUITS: AKUN (ID: 580) ---
    {
        name: "Akun Blox Fruits Max Level 2550 + Godhuman + Cursed Dual Katana + Soul Guitar",
        slug: "demo-bf-akun-max-godhuman",
        sku: "DEMO-BF-AKUN-01",
        regular_price: "150000",
        sale_price: "119000",
        stock_quantity: 5,
        categories: [{ id: 26 }, { id: 580 }],
        attributes: [
            { name: "Server", visible: true, variation: false, options: ["Global"] },
            { name: "Tier", visible: true, variation: false, options: ["Endgame"] },
            { name: "Melee", visible: true, variation: false, options: ["Godhuman Full Mastery"] },
            { name: "Sword", visible: true, variation: false, options: ["Cursed Dual Katana"] }
        ],
        description: "<p><strong>Spesifikasi Akun Blox Fruits Max Level 2550 (Endgame):</strong></p><ul><li>Level: 2550 (Max Cap)</li><li>Melee: Godhuman Full Unlock (All Skill Mastery 400+)</li><li>Sword: Cursed Dual Katana (CDK) + Soul Guitar</li><li>Beli: 25.000.000+ | Fragment: 45.000+</li><li>Status Akun: Unverified (Email & No HP belum dikaitkan, 100% aman anti-hackback)</li><li>Garansi: Garansi Resmi Yasui Game 30 Hari</li></ul>",
        short_description: "Max Level 2550, Full Melee Godhuman, CDK, Soul Guitar. Unverified email, 100% aman bergaransi."
    },
    {
        name: "Akun Blox Fruits Starter Fruit Kitsune Permanent + Sea 2 Ready Level 1500",
        slug: "demo-bf-akun-starter-kitsune",
        sku: "DEMO-BF-AKUN-02",
        regular_price: "85000",
        sale_price: "69000",
        stock_quantity: 8,
        categories: [{ id: 26 }, { id: 580 }],
        attributes: [
            { name: "Server", visible: true, variation: false, options: ["Global"] },
            { name: "Tier", visible: true, variation: false, options: ["Fresh"] },
            { name: "Fruit", visible: true, variation: false, options: ["Permanent Kitsune"] }
        ],
        description: "<p><strong>Akun Starter Blox Fruits Buah Kitsune Permanent:</strong></p><ul><li>Permanent Fruit: Kitsune (Bisa dipakai kapan saja tanpa hilang)</li><li>Level: 1500 (Sudah membuka Sea 2)</li><li>Bonus: Sharkman Karate + 5 Juta Beli</li><li>Status: 100% Polos Unverified (Bisa langsung bind ke email pembeli)</li></ul>",
        short_description: "Permanent Kitsune, Level 1500 Sea 2, Unverified 100% siap kaitkan ke email pembeli."
    },

    // --- 2. BLOX FRUITS: BLOX FRUIT / IN-GAME ITEM (ID: 581) ---
    {
        name: "Physical Fruit Kitsune Mythical Blox Fruits (Trade Sea 2 / Sea 3)",
        slug: "demo-bf-fruit-kitsune",
        sku: "DEMO-BF-FRUIT-KITSUNE",
        regular_price: "95000",
        sale_price: "79000",
        stock_quantity: 15,
        categories: [{ id: 26 }, { id: 581 }],
        description: "<p><strong>Physical Fruit Kitsune (Mythical Tier):</strong></p><ul><li>Metode Pengiriman: Trade di Private Server Sea 2 atau Sea 3</li><li>Estimasi Pengiriman: 5 - 15 Menit setelah order terverifikasi</li><li>Syarat Trade: Pastikan pembeli menyiapkan buah tumbal minimal 60% value trade limit</li><li>Proses: Seller memberikan link Private Server, trade selesai dalam 2 menit</li></ul>",
        short_description: "Physical Fruit Kitsune Mythical. Pengiriman cepat 5-15 menit via Trade di Private Server Sea 2 / Sea 3."
    },
    {
        name: "Physical Fruit Leopard Mythical Blox Fruits (Instant Trade)",
        slug: "demo-bf-fruit-leopard",
        sku: "DEMO-BF-FRUIT-LEOPARD",
        regular_price: "60000",
        sale_price: "49000",
        stock_quantity: 20,
        categories: [{ id: 26 }, { id: 581 }],
        description: "<p><strong>Physical Fruit Leopard (Mythical Tier):</strong></p><ul><li>Metode Pengiriman: Trade di Private Server Sea 2 / Sea 3</li><li>Seller Online & Fast Response 24 Jam</li><li>Garansi item 100% aman hasil gacha resmi in-game</li></ul>",
        short_description: "Physical Fruit Leopard Mythical. Penyerahan via Trade Private Server 5–15 menit siap kirim."
    },

    // --- 3. BLOX FRUITS: GAMEPASS (ID: 582) ---
    {
        name: "Blox Fruits Gamepass - 2x Mastery / 2x Money / Fast Boats (Gift In-Game)",
        slug: "demo-bf-gamepass-blox-fruits",
        sku: "DEMO-BF-GP-2XMASTERY",
        regular_price: "75000",
        sale_price: "59000",
        stock_quantity: 50,
        categories: [{ id: 26 }, { id: 582 }],
        description: "<p><strong>Gamepass Blox Fruits Resmi (Gift In-Game):</strong></p><ul><li>Pengiriman via Direct Gift di dalam game (Tanpa butuh password/login akun)</li><li>Pilihan Gamepass: 2x Mastery, 2x Money, 2x Drop Rate, Fast Boats, Dark Blade, Fruit Storage</li><li>Proses kilat 1-5 menit: Cukup input username Roblox Anda saat checkout</li></ul>",
        short_description: "Gamepass Blox Fruits resmi via Direct Gift In-Game tanpa login akun. Pilih Gamepass favorit Anda."
    },
    {
        name: "Blox Fruits Permanent Fruit - Perm Buddha / Perm Portal (Direct Gift)",
        slug: "demo-bf-gamepass-perm-buddha",
        sku: "DEMO-BF-GP-PERM-BUDDHA",
        regular_price: "250000",
        sale_price: "219000",
        stock_quantity: 25,
        categories: [{ id: 26 }, { id: 582 }],
        description: "<p><strong>Permanent Fruit Blox Fruits:</strong></p><ul><li>Metode Pengiriman: Direct In-Game Gift</li><li>Permanen selamanya di akun Anda, bisa ditukar kapan saja di Fruit Dealer</li><li>Legal & 100% aman dari Robux developer resmi</li></ul>",
        short_description: "Permanent Fruit Buddha / Portal via Direct Gift In-Game. Permanen selamanya di inventori akun Anda."
    },

    // --- 4. BLOX FRUITS: JASA JOKI (ID: 583) ---
    {
        name: "Joki Blox Fruits - Jasa Naik Level Max 2550 + Bonus Fragment & Beli",
        slug: "demo-bf-joki-max-level",
        sku: "DEMO-BF-JOKI-MAX",
        regular_price: "50000",
        sale_price: "39000",
        stock_quantity: 10,
        categories: [{ id: 26 }, { id: 583 }],
        description: "<p><strong>Jasa Joki Level Blox Fruits Tercepat:</strong></p><ul><li>Joki level 1 ke level 2550 atau leveling custom</li><li>100% Pengerjaan Manual oleh pro player (Tanpa auto farm exploit / script berbahaya)</li><li>Bonus Beli jutaan & ribuan fragment selama proses leveling</li><li>Estimasi pengerjaan: 1 - 24 jam (Tergantung selisih level)</li></ul>",
        short_description: "Jasa joki level Blox Fruits cepat & terpercaya. Pengerjaan manual pro player 100% aman anti-banned."
    },
    {
        name: "Joki Blox Fruits - Unlock Cursed Dual Katana (CDK) & Soul Guitar Quest",
        slug: "demo-bf-joki-cdk-guitar",
        sku: "DEMO-BF-JOKI-CDK",
        regular_price: "80000",
        sale_price: "65000",
        stock_quantity: 10,
        categories: [{ id: 26 }, { id: 583 }],
        description: "<p><strong>Jasa Joki Quest Blox Fruits:</strong></p><ul><li>Penyelesaian seluruh quest puzzle Cursed Dual Katana (CDK)</li><li>Penyelesaian quest Soul Guitar Full Puzzle & Crafting</li><li>Privasi akun terjamin, wajib ganti password setelah serah terima</li></ul>",
        short_description: "Jasa joki quest Cursed Dual Katana (CDK) & Soul Guitar sampai selesai bergaransi."
    },

    // --- 5. BLOX FRUITS: OTHER BOOSTING SERVICES (ID: 584) ---
    {
        name: "Blox Fruits - Jasa Raid Law / Dough V2 Awakening Full Unlock All Skills",
        slug: "demo-bf-boost-dough-awakening",
        sku: "DEMO-BF-BOOST-DOUGH",
        regular_price: "45000",
        sale_price: "35000",
        stock_quantity: 15,
        categories: [{ id: 26 }, { id: 584 }],
        description: "<p><strong>Layanan Raid Awakening Blox Fruits:</strong></p><ul><li>Full Awakening skill Dough V2 atau Phoenix / Magma / Buddha</li><li>Include Microchip raid dari joki, pembeli tinggal terima beres</li><li>Estimasi: 30 - 60 menit</li></ul>",
        short_description: "Jasa raid awakening buah Dough V2 lengkap sampai full unlock move Z X C V F."
    },

    // --- 6. SAMPLE NON-ROBLOX: MOBILE LEGENDS (ID: 16) ---
    {
        name: "Top Up Diamond Mobile Legends 86 - 706 Diamonds Kilat Fast Delivery",
        slug: "demo-mlbb-top-up-diamonds",
        sku: "DEMO-MLBB-TOPUP-01",
        regular_price: "30000",
        sale_price: "25000",
        stock_quantity: 100,
        categories: [{ id: 16 }, { id: 81 }],
        description: "<p><strong>Top Up Diamond Mobile Legends Resmi:</strong></p><ul><li>Kirimkan User ID (UID) & Zone ID Anda</li><li>Pengiriman instan 1 - 3 detik otomatis</li><li>100% Legal & Aman, tidak menyebabkan minus diamond</li></ul>",
        short_description: "Top up diamond Mobile Legends instan 1-3 detik via UID & Zone ID resmi anti-minus."
    },
    {
        name: "Mobile Legends - Gift Charisma Love Gun / Fireworks / Pesawat (Instan)",
        slug: "demo-mlbb-gift-charisma-instant",
        sku: "DEMO-MLBB-CHARISMA-01",
        regular_price: "15000",
        sale_price: "10000",
        stock_quantity: 50,
        categories: [{ id: 16 }, { id: 83 }],
        description: "<p><strong>Gift Charisma MLBB Instan:</strong></p><ul><li>Meningkatkan skor charisma profil MLBB secara drastis</li><li>Kirim via UID & Server tanpa perlu berteman 7 hari</li><li>Pengiriman 5 - 10 menit</li></ul>",
        short_description: "Gift Charisma MLBB instan via UID & Server tanpa tunggu 7 hari berteman."
    },
    {
        name: "Mobile Legends - Gift Skin Epic / Special / Lightborn (Wajib Teman 7 Hari)",
        slug: "demo-mlbb-gift-skin-7-hari",
        sku: "DEMO-MLBB-GIFT7D-01",
        regular_price: "150000",
        sale_price: "125000",
        stock_quantity: 20,
        categories: [{ id: 16 }, { id: 84 }],
        description: "<p><strong>Gift Skin Mobile Legends (Ketentuan 7 Hari):</strong></p><ul><li>Sesuai regulasi Moonton, pengirim dan penerima gift skin wajib berteman in-game selama minimal 7 hari (168 jam)</li><li>Setelah order, admin akan memberikan ID akun pengirim untuk di-add friend</li><li>Setelah 7 hari berteman, skin dikirimkan langsung ke in-game mailbox Anda</li></ul>",
        short_description: "Gift Skin MLBB resmi dengan syarat berteman in-game 7 hari sesuai aturan Moonton."
    },
    {
        name: "Akun Mobile Legends Sultan - Full Skin Collector & All Heroes Max Emblem",
        slug: "demo-mlbb-akun-sultan-collector",
        sku: "DEMO-MLBB-AKUN-01",
        regular_price: "850000",
        sale_price: "699000",
        stock_quantity: 3,
        categories: [{ id: 16 }, { id: 82 }],
        attributes: [
            { name: "Server", visible: true, variation: false, options: ["Indonesia"] },
            { name: "Tier", visible: true, variation: false, options: ["Endgame Sultan"] }
        ],
        description: "<p><strong>Spesifikasi Akun Sultan Mobile Legends:</strong></p><ul><li>Skin Collector: 5 Skin | Skin Legend: Gusion & Lesley</li><li>Semua Hero Lengkap (125+ Heroes)</li><li>All Emblem Max Level 60</li><li>Monsep No Minus, all unbind siap bind ke email pembeli</li><li>Garansi Resmi Anti-Recall Yasui Game</li></ul>",
        short_description: "Akun Sultan MLBB Full Collector & Legend. Monsep all unbind garansi 100% anti-hackback."
    }
];

/**
 * Generator Produk Sampel Dinamis Sesuai Karakteristik Sub-Kategori
 */
function generateDynamicSampleProduct(game, sub, isLeafGame, robloxId) {
    const rawSubName = sub.name.trim();
    const rawGameName = game.name.trim();
    const subSlug = sub.slug.toLowerCase();
    const subNameLower = rawSubName.toLowerCase();

    // Kategorisasi hierarkis
    const categories = [];
    if (robloxId && game.parent === robloxId) {
        categories.push({ id: robloxId });
    }
    categories.push({ id: game.id });
    if (!isLeafGame && sub.id !== game.id) {
        categories.push({ id: sub.id });
    }

    // SKU unik dan ramah WooCommerce
    const cleanSubSlug = sub.slug.replace(/^demo-/, "").slice(0, 24);
    const sku = `DEMO-${sub.id}-${cleanSubSlug}`.toUpperCase().slice(0, 48);
    const slug = `demo-${sub.id}-${sub.slug}`;

    let name = "";
    let regularPrice = "50000";
    let salePrice = "39000";
    let stockQuantity = 10;
    let desc = "";
    let shortDesc = "";
    let attributes = [];

    if (subSlug.includes("akun") || subNameLower.includes("akun") || subNameLower.includes("account")) {
        name = `Akun ${rawGameName} - Starter / Endgame Unverified 100% Aman`;
        regularPrice = "120000";
        salePrice = "99000";
        stockQuantity = 5;
        attributes = [
            { name: "Server", visible: true, variation: false, options: ["Global"] },
            { name: "Tier", visible: true, variation: false, options: ["Endgame Ready"] }
        ];
        desc = `<p><strong>Akun ${rawGameName} Siap Pakai:</strong></p><ul><li>Level / Progress: Siap Main</li><li>Status Akun: Unverified (100% aman anti-hackback)</li><li>Garansi Resmi Yasui Game</li></ul>`;
        shortDesc = `Akun ${rawGameName} terverifikasi aman bergaransi resmi Yasui Game.`;
    } else if (
        subSlug.includes("top-up") || subSlug.includes("topup") || subNameLower.includes("top up") ||
        subNameLower.includes("diamond") || subNameLower.includes("gems") || subNameLower.includes("koin") ||
        subNameLower.includes("coins") || subNameLower.includes("currency") || subNameLower.includes("cash") ||
        subNameLower.includes("gold") || subNameLower.includes("pearls") || subNameLower.includes("lock") ||
        subNameLower.includes("wallet") || subNameLower.includes("token") || subNameLower.includes("yen") ||
        subNameLower.includes("emeralds") || subNameLower.includes("money")
    ) {
        name = `${rawGameName} - ${rawSubName} Fast Instant Delivery`;
        regularPrice = "45000";
        salePrice = "35000";
        stockQuantity = 100;
        desc = `<p><strong>${rawSubName} ${rawGameName}:</strong></p><ul><li>Pengiriman kilat 1-5 menit via UID / ID Akun</li><li>100% Legal & Aman, terpercaya tanpa login akun</li></ul>`;
        shortDesc = `${rawSubName} ${rawGameName} kilat 1-5 menit via ID resmi anti-minus.`;
    } else if (
        subSlug.includes("gamepass") || subNameLower.includes("gamepass") || subNameLower.includes("pass") ||
        subNameLower.includes("vip") || subNameLower.includes("double") || subNameLower.includes("2x") ||
        subNameLower.includes("multiplier") || subNameLower.includes("bundle") || subNameLower.includes("upgrade") ||
        subNameLower.includes("projectile") || subNameLower.includes("roll") || subNameLower.includes("treadmill") ||
        subNameLower.includes("capacity") || subNameLower.includes("spawn") || subNameLower.includes("equip")
    ) {
        name = `${rawGameName} - ${rawSubName} (Direct Gift / Trade)`;
        regularPrice = "75000";
        salePrice = "59000";
        stockQuantity = 50;
        desc = `<p><strong>Gamepass & Fitur ${rawGameName}:</strong></p><ul><li>Pengiriman via In-Game Gift atau Private Server</li><li>Permanen di akun Roblox Anda</li><li>Legal & Aman dari developer resmi</li></ul>`;
        shortDesc = `${rawSubName} ${rawGameName} via Direct Gift In-Game tanpa login akun.`;
    } else if (
        subSlug.includes("joki") || subNameLower.includes("joki") || subNameLower.includes("boosting") ||
        subNameLower.includes("boost") || subNameLower.includes("raid") || subNameLower.includes("quest")
    ) {
        name = `Jasa Joki ${rawGameName} - ${rawSubName} Cepat & Bergaransi`;
        regularPrice = "60000";
        salePrice = "45000";
        stockQuantity = 15;
        desc = `<p><strong>Layanan Joki ${rawGameName}:</strong></p><ul><li>Pengerjaan 100% manual oleh pro player berpengalaman</li><li>Tanpa exploit / cheat berbahaya, privasi akun terjamin</li><li>Estimasi pengerjaan cepat dan bergaransi</li></ul>`;
        shortDesc = `Jasa joki ${rawSubName} ${rawGameName} cepat, manual 100% aman anti-banned.`;
    } else if (
        subSlug.includes("gift") || subNameLower.includes("gift") || subSlug.includes("7-hari") ||
        subNameLower.includes("charisma") || subNameLower.includes("popularity")
    ) {
        name = `${rawGameName} - ${rawSubName} Fast Gift Delivery`;
        regularPrice = "85000";
        salePrice = "69000";
        stockQuantity = 20;
        desc = `<p><strong>Layanan Gift In-Game ${rawGameName}:</strong></p><ul><li>Metode pengiriman sesuai regulasi in-game resmi</li><li>CS Online & Fast Response 24 Jam</li></ul>`;
        shortDesc = `${rawSubName} ${rawGameName} resmi fast delivery sesuai aturan game.`;
    } else {
        // Item, Pet, Unit, Fruit, Stand, Skin, Mount, Fish, Weapon, dll
        name = `${rawGameName} - ${rawSubName} Ready In-Game Delivery`;
        regularPrice = "50000";
        salePrice = "39000";
        stockQuantity = 25;
        desc = `<p><strong>Item ${rawSubName} ${rawGameName}:</strong></p><ul><li>Metode Pengiriman: Trade di Private Server / Trade Hub</li><li>Penyerahan cepat 5 - 15 menit setelah pembayaran</li><li>Stok ready siap kirim</li></ul>`;
        shortDesc = `${rawSubName} ${rawGameName} ready stock via trade cepat 5-15 menit.`;
    }

    return {
        name,
        slug,
        type: "simple",
        status: "publish",
        regular_price: regularPrice,
        sale_price: salePrice,
        sku,
        manage_stock: true,
        stock_quantity: stockQuantity,
        stock_status: "instock",
        categories,
        attributes,
        description: desc,
        short_description: shortDesc
    };
}

/**
 * Fetch Seluruh Kategori dari WooCommerce
 */
async function fetchAllCategories() {
    console.log("🔍 Memindai seluruh taksonomi kategori di WooCommerce...");
    const allCategories = [];
    let page = 1;

    while (true) {
        const batch = await wcFetch("products/categories", {
            params: {
                per_page: 100,
                page,
                hide_empty: false
            },
            bypassCache: true
        });

        if (!batch || batch.length === 0) break;
        allCategories.push(...batch);
        if (batch.length < 100) break;
        page++;
    }

    console.log(`✅ Total kategori ditemukan: ${allCategories.length} kategori.`);
    return allCategories;
}

/**
 * Fetch Seluruh Produk Demo Eksisting (SKU 'DEMO-*')
 */
async function fetchAllDemoProducts() {
    console.log("🔍 Mengecek produk demo eksisting di WooCommerce...");
    const demoProducts = [];
    let page = 1;

    while (true) {
        const batch = await wcFetch("products", {
            params: {
                per_page: 100,
                page
            },
            bypassCache: true
        });

        if (!batch || batch.length === 0) break;
        const matched = batch.filter(p => (p.sku && p.sku.startsWith("DEMO-")) || (p.slug && p.slug.startsWith("demo-")));
        demoProducts.push(...matched);

        if (batch.length < 100) break;
        page++;
    }

    console.log(`ℹ️ Ditemukan ${demoProducts.length} produk demo eksisting.`);
    return demoProducts;
}

/**
 * Mode Pembersihan: Hapus Seluruh Produk Demo Menggunakan WooCommerce Batch API
 */
async function cleanDemoProducts() {
    console.log("🧹 [Clean Demo] Memulai pembersihan produk sampel ber-SKU 'DEMO-*'...");
    const demoProds = await fetchAllDemoProducts();

    if (demoProds.length === 0) {
        console.log("✅ Tidak ada produk demo yang perlu dihapus.");
        return;
    }

    const idsToDelete = demoProds.map(p => p.id);
    const BATCH_SIZE = 30;
    const totalBatches = Math.ceil(idsToDelete.length / BATCH_SIZE);

    console.log(`🗑️ Menghapus ${idsToDelete.length} produk demo dalam ${totalBatches} batch...`);

    let deletedCount = 0;
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
        const chunk = idsToDelete.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE) + 1;

        try {
            const res = await wcFetch("products/batch", {
                method: "POST",
                body: { delete: chunk },
                params: { force: true },
                bypassCache: true,
                timeoutMs: 30000
            });

            const count = res.delete ? res.delete.length : chunk.length;
            deletedCount += count;
            console.log(`   ✓ [Batch ${batchIndex}/${totalBatches}] Berhasil menghapus ${count} produk.`);
        } catch (err) {
            console.error(`   ❌ [Batch ${batchIndex}/${totalBatches}] Gagal menghapus:`, err.message);
        }
        await new Promise(r => setTimeout(r, 500));
    }

    clearWcCache();
    console.log(`\n🎉 Selesai! Berhasil membersihkan ${deletedCount} produk demo dari WooCommerce.`);
}

/**
 * Seeding Produk Sampel ke Seluruh Sub-Kategori Kosong Menggunakan Batch API
 */
async function seedAllShowcaseProducts() {
    console.log("🚀 [Seed Showcase] Memulai pemindaian dan seeding otomatis ke seluruh kategori kosong...");

    const allCategories = await fetchAllCategories();
    const existingDemoProds = await fetchAllDemoProducts();

    // Set SKU & Kategori ID yang sudah memiliki produk
    const existingSkus = new Set(existingDemoProds.map(p => p.sku));
    const categoriesWithDemo = new Set();
    for (const p of existingDemoProds) {
        for (const c of (p.categories || [])) {
            categoriesWithDemo.add(c.id);
        }
    }

    const roblox = allCategories.find(c => c.slug === "roblox");
    const robloxId = roblox ? roblox.id : null;

    // Identifikasi Game Roots:
    // 1. Root categories (parent === 0), abaikan arsip internal & roblox parent container
    // 2. Direct children of roblox (sub-game Roblox)
    const gameRoots = allCategories.filter(c => {
        if (c.slug === "arsip-internal" || c.slug === "roblox") return false;
        if (c.parent === 0) return true;
        if (robloxId && c.parent === robloxId) return true;
        return false;
    });

    console.log(`🎮 Terdeteksi ${gameRoots.length} Game Roots (Roblox & Non-Roblox).`);

    // Kumpulkan produk yang akan di-create
    const productsToCreate = [];

    // 1. Masukkan Curated Showcase Products (Blox Fruits & MLBB) jika belum ada
    for (const cp of CURATED_SHOWCASE_PRODUCTS) {
        if (!existingSkus.has(cp.sku)) {
            productsToCreate.push({
                name: cp.name,
                slug: cp.slug,
                type: "simple",
                status: "publish",
                regular_price: cp.regular_price,
                sale_price: cp.sale_price,
                description: cp.description,
                short_description: cp.short_description,
                sku: cp.sku,
                manage_stock: true,
                stock_quantity: cp.stock_quantity,
                stock_status: "instock",
                categories: cp.categories,
                attributes: cp.attributes || []
            });
            // Tandai subkategori terisi
            cp.categories.forEach(c => categoriesWithDemo.add(c.id));
        }
    }

    // 2. Pindai seluruh Game Roots & Sub-Kategorinya yang masih 0 produk
    let emptySubCount = 0;
    for (const gr of gameRoots) {
        const subs = allCategories.filter(c => c.parent === gr.id);

        if (subs.length > 0) {
            // Game memiliki subkategori (Akun, Top Up, Gamepass, Item, Joki, dll.)
            for (const sub of subs) {
                // Syarat: subkategori kosong (count === 0) dan belum punya demo product
                if (sub.count === 0 && !categoriesWithDemo.has(sub.id)) {
                    emptySubCount++;
                    const prod = generateDynamicSampleProduct(gr, sub, false, robloxId);
                    if (!existingSkus.has(prod.sku)) {
                        productsToCreate.push(prod);
                        existingSkus.add(prod.sku);
                        categoriesWithDemo.add(sub.id);
                    }
                }
            }
        } else {
            // Game tanpa subkategori (Leaf game)
            if (gr.count === 0 && !categoriesWithDemo.has(gr.id)) {
                emptySubCount++;
                const prod = generateDynamicSampleProduct(gr, gr, true, robloxId);
                if (!existingSkus.has(prod.sku)) {
                    productsToCreate.push(prod);
                    existingSkus.add(prod.sku);
                    categoriesWithDemo.add(gr.id);
                }
            }
        }
    }

    console.log(`📊 Ditemukan ${emptySubCount} sub-kategori kosong tanpa produk.`);
    console.log(`📦 Total produk sampel baru yang akan di-injeksi: ${productsToCreate.length} produk.`);

    if (productsToCreate.length === 0) {
        console.log("✨ Seluruh kategori dan sub-kategori sudah memiliki produk! Tidak ada produk baru yang perlu dibuat.");
        return;
    }

    // Eksekusi Batch Injeksi via WooCommerce /products/batch (Chunk 30 items)
    const BATCH_SIZE = 30;
    const totalBatches = Math.ceil(productsToCreate.length / BATCH_SIZE);
    let totalSuccess = 0;
    let totalFailed = 0;

    console.log(`\n⚡ Memulai pengiriman batch ke WooCommerce (/products/batch)...`);

    for (let i = 0; i < productsToCreate.length; i += BATCH_SIZE) {
        const chunk = productsToCreate.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        try {
            console.log(`   ⏳ Mengirim Batch ${batchNum}/${totalBatches} (${chunk.length} produk)...`);
            const res = await wcFetch("products/batch", {
                method: "POST",
                body: { create: chunk },
                bypassCache: true,
                timeoutMs: 30000
            });

            const created = res.create ? res.create.length : 0;
            totalSuccess += created;
            console.log(`   ✓ [Batch ${batchNum}/${totalBatches}] Sukses membuat ${created} produk.`);
        } catch (err) {
            totalFailed += chunk.length;
            console.error(`   ❌ [Batch ${batchNum}/${totalBatches}] Gagal:`, err.message);
        }
        await new Promise(r => setTimeout(r, 600));
    }

    clearWcCache();

    console.log("\n========================================================");
    console.log(`🎉 Inisialisasi Selesai!`);
    console.log(`   - Berhasil Di-Seed : ${totalSuccess} produk`);
    console.log(`   - Gagal           : ${totalFailed} produk`);
    console.log(`   - Produk Eksisting: ${existingDemoProds.length} produk`);
    console.log("========================================================");
    console.log("Semua kategori dan sub-kategori game di Yasui Game kini memiliki produk sampel nyata!");
    console.log("Untuk membersihkan kapan saja: node --env-file=.env scripts/maintenance/seed-showcase-products.mjs --clean-demo\n");
}

async function main() {
    try {
        if (IS_CLEAN) {
            await cleanDemoProducts();
        } else {
            await seedAllShowcaseProducts();
        }
    } catch (err) {
        console.error("Fatal Error saat eksekusi script:", err);
        process.exit(1);
    }
}

main();
