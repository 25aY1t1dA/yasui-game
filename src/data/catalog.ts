export interface SubCategoryPill {
    name: string;
    slug: string;
    isHot?: boolean;
}

export interface CatalogGameItem {
    name: string;
    slug: string;
    ecosystem: 'roblox' | 'mobile_pc' | 'voucher';
    badge?: string;
    image?: string;
    subCategories: SubCategoryPill[];
    aliases?: string[];
}

export interface RobloxServiceChip {
    name: string;
    slug: string;
    icon: string;
    badge?: string;
}

export const ROBLOX_QUICK_SERVICES: RobloxServiceChip[] = [
    {
        name: "Robux via Login",
        slug: "robux-via-login",
        icon: "i-lucide-gem",
        badge: "INSTANT"
    },
    {
        name: "Robux via Username",
        slug: "robux-via-username",
        icon: "i-lucide-zap",
        badge: "NO PWD"
    },
    {
        name: "Robux 5 Hari",
        slug: "robux-5-hari",
        icon: "i-lucide-clock",
        badge: "HEMAT"
    },
    {
        name: "Robux Gift Card",
        slug: "robux-game-card",
        icon: "i-lucide-gift",
        badge: "RESMI"
    },
    {
        name: "Akun Roblox",
        slug: "roblox-akun",
        icon: "i-lucide-user-check",
        badge: "CLEAN"
    }
];

export const ROBLOX_SPOTLIGHT_GAMES: CatalogGameItem[] = [
    {
        name: "Blox Fruits",
        slug: "blox-fruits",
        ecosystem: "roblox",
        badge: "VIRAL #1",
        image: "https://tr.rbxcdn.com/180DAY-774ec14539b264f85fdb6e8a34dfa344/512/512/Image/Png/noFilter",
        subCategories: [
            { name: "Fruit", slug: "blox-fruits-fruit", isHot: true },
            { name: "Gamepass", slug: "blox-fruits-gamepass" },
            { name: "Akun", slug: "blox-fruits-akun", isHot: true },
            { name: "Joki", slug: "blox-fruits-jasa-joki" }
        ],
        aliases: ["bf", "blox fruit", "devil fruit", "kitsune", "leopard", "dragon"]
    },
    {
        name: "Fish It!",
        slug: "fish-it",
        ecosystem: "roblox",
        badge: "HOT",
        image: "https://tr.rbxcdn.com/180DAY-04de559cdc617b844f0c4448e0f79e5c/512/512/Image/Png/noFilter",
        subCategories: [
            { name: "Fish", slug: "fish-it-fish", isHot: true },
            { name: "Gamepass", slug: "fish-it-gamepass" },
            { name: "Item", slug: "fish-it-item" },
            { name: "Akun", slug: "fish-it-akun" },
            { name: "Joki", slug: "fish-it-joki" }
        ],
        aliases: ["fish", "mancing", "fishing"]
    },
    {
        name: "Grow A Garden",
        slug: "grow-a-garden",
        ecosystem: "roblox",
        badge: "TRENDING",
        image: "https://tr.rbxcdn.com/180DAY-b6ad84a02b4c8522137a069f7810c1b3/512/512/Image/Png/noFilter",
        subCategories: [
            { name: "Coins", slug: "grow-a-garden-coins", isHot: true },
            { name: "Pets", slug: "grow-a-garden-pets" },
            { name: "Item", slug: "grow-a-garden-item" },
            { name: "Akun", slug: "grow-a-garden-akun" }
        ],
        aliases: ["gag", "kebun", "taman", "garden"]
    },
    {
        name: "Adopt Me!",
        slug: "adopt-me",
        ecosystem: "roblox",
        badge: "POPULAR",
        image: "https://tr.rbxcdn.com/180DAY-fd05afa91e29a7895178342064489a36/512/512/Image/Png/noFilter",
        subCategories: [
            { name: "Pet", slug: "adopt-me-pet", isHot: true },
            { name: "Item", slug: "adopt-me-item" },
            { name: "Akun", slug: "adopt-me-akun" },
            { name: "Others", slug: "adopt-me-others" }
        ],
        aliases: ["am", "pet adopt me", "shadow dragon", "bat dragon"]
    },
    {
        name: "Steal A Brainrot",
        slug: "steal-a-brainrot",
        ecosystem: "roblox",
        badge: "VIRAL",
        image: "https://tr.rbxcdn.com/180DAY-fcdec94c7542627c9b5947a3102a0b6c/512/512/Image/Png/noFilter",
        subCategories: [
            { name: "Money", slug: "steal-a-brainrot-money", isHot: true },
            { name: "Gamepass", slug: "steal-a-brainrot-gamepass" },
            { name: "Item", slug: "steal-a-brainrot-item" },
            { name: "Akun", slug: "steal-a-brainrot-akun" }
        ],
        aliases: ["brainrot", "skibidi", "steal"]
    },
    {
        name: "99 Nights in the Forest",
        slug: "99-nights-in-the-forest",
        ecosystem: "roblox",
        badge: "POPULAR",
        image: "https://tr.rbxcdn.com/180DAY-384fc6072a05d56c9885b3a612f8e981/512/512/Image/Png/noFilter",
        subCategories: [
            { name: "Akun", slug: "99-nights-in-the-forest-akun", isHot: true },
            { name: "Joki", slug: "99-nights-in-the-forest-joki" }
        ],
        aliases: ["99 nights", "forest", "survival"]
    },
    {
        name: "Fisch",
        slug: "fisch",
        ecosystem: "roblox",
        badge: "TOP HIT",
        image: "https://tr.rbxcdn.com/180DAY-1874915760d886df6bbc35fa96639c7e/512/512/Image/Png/noFilter",
        subCategories: [
            { name: "Fish", slug: "fisch-fish", isHot: true },
            { name: "Gamepass", slug: "fisch-gamepass" },
            { name: "Money", slug: "fisch-money" },
            { name: "Item", slug: "fisch-item" },
            { name: "Akun", slug: "fisch-akun" }
        ],
        aliases: ["fisch roblox", "rod", "mythic fish"]
    },
    {
        name: "Anime Defenders",
        slug: "anime-defenders",
        ecosystem: "roblox",
        badge: "POPULAR",
        image: "https://tr.rbxcdn.com/180DAY-2ef69e4e4d0be01a2b12ecb16536d54f/512/512/Image/Png/noFilter",
        subCategories: [
            { name: "Unit", slug: "anime-defenders-unit", isHot: true },
            { name: "Trait Crystal", slug: "anime-defenders-item" },
            { name: "Koin Game", slug: "anime-defenders-currency" },
            { name: "Akun", slug: "anime-defenders-akun" }
        ],
        aliases: ["ad", "anime defender", "gem"]
    }
];

export const NON_ROBLOX_SUBCATEGORIES_MAP: Record<string, SubCategoryPill[]> = {
    "summoners-war-sky-arena": [
        { name: "Akun LD5 / Starter", slug: "sw-akun", isHot: true },
        { name: "Fresh Blessing", slug: "summoners-war-sky-arena" },
        { name: "Automated Hive", slug: "summoners-war-sky-arena" }
    ],
    "mobile-legends": [
        { name: "Akun", slug: "mlbb-akun", isHot: true },
        { name: "Top Up", slug: "mlbb-top-up" },
        { name: "Gift Charisma", slug: "mlbb-gift-charisma" },
        { name: "Gift Item (7 Hari)", slug: "mlbb-gift-item-7-hari" }
    ],
    "growtopia": [
        { name: "Lock (DL/BGL)", slug: "growtopia-lock", isHot: true },
        { name: "Item", slug: "growtopia-item" },
        { name: "Top Up", slug: "growtopia-top-up" },
        { name: "Akun", slug: "growtopia-akun" },
        { name: "World", slug: "growtopia-world" }
    ],
    "garena-free-fire": [
        { name: "Top Up", slug: "ff-top-up", isHot: true },
        { name: "Akun", slug: "ff-akun" },
        { name: "Item", slug: "ff-item" }
    ],
    "genshin-impact": [
        { name: "Top Up", slug: "gi-top-up", isHot: true },
        { name: "Akun", slug: "gi-akun" }
    ],
    "honkai-star-rail": [
        { name: "Top Up", slug: "hsr-top-up", isHot: true },
        { name: "Akun", slug: "hsr-akun" }
    ],
    "blue-archive": [
        { name: "Akun", slug: "ba-akun", isHot: true }
    ],
    "arknights-endfield": [
        { name: "Top Up", slug: "arknights-top-up", isHot: true },
        { name: "Akun", slug: "arknights-akun" }
    ],
    "bleach-soul-resonance": [
        { name: "Top Up", slug: "bleach-top-up", isHot: true },
        { name: "Akun", slug: "bleach-akun" }
    ],
    "zenless-zone-zero": [
        { name: "Akun", slug: "zzz-akun", isHot: true },
        { name: "Top Up", slug: "zzz-top-up" }
    ],
    "clash-of-clans": [
        { name: "Akun", slug: "coc-akun", isHot: true },
        { name: "Joki", slug: "coc-joki" }
    ],
    "clash-royale": [
        { name: "Akun", slug: "cr-akun", isHot: true },
        { name: "Joki", slug: "cr-joki" }
    ],
    "one-piece-bounty-rush": [
        { name: "Akun", slug: "opbr-akun", isHot: true }
    ],
    "efootball-mobile": [
        { name: "Akun", slug: "efootball-akun", isHot: true }
    ],
    "hay-day": [
        { name: "Coin", slug: "hayday-coin", isHot: true },
        { name: "Paket Upgrade", slug: "hayday-paket-upgrade" },
        { name: "Akun", slug: "hayday-akun" }
    ],
    "magic-chess-go-go": [
        { name: "Akun", slug: "mcgg-akun", isHot: true },
        { name: "Joki Rank", slug: "mcgg-joki-rank" },
        { name: "Top Up", slug: "mcgg-top-up" }
    ],
    "chaos-zero-nightmare": [
        { name: "Akun", slug: "czn-akun", isHot: true }
    ],
    "grand-summoners": [
        { name: "Akun", slug: "gs-akun", isHot: true }
    ],
    "pubg-mobile": [
        { name: "Akun", slug: "pubg-mobile", isHot: true }
    ],
    "wuthering-waves": [
        { name: "Akun", slug: "wuthering-waves", isHot: true }
    ],
    "razer-gold-pin": [
        { name: "Nominal IDR", slug: "razer-gold-pin", isHot: true },
        { name: "Global PIN", slug: "razer-gold-pin" }
    ],
    "garena-shell": [
        { name: "Voucher Shell", slug: "garena-shell", isHot: true },
        { name: "KiosGamer Redeem", slug: "garena-shell" }
    ],
    "steam": [
        { name: "Steam Wallet IDR", slug: "steam", isHot: true },
        { name: "Game Key", slug: "steam" }
    ]
};

export const VOUCHER_SLUGS = new Set([
    "razer-gold-pin",
    "garena-shell",
    "steam",
    "robux-game-card",
    "robux-gift-card",
    "rbl-credits-gift-card"
]);

export function getGameEcosystem(slug: string): 'roblox' | 'voucher' | 'mobile_pc' {
    if (slug === 'roblox' || slug.startsWith('roblox-') || slug.startsWith('robux-')) return 'roblox';
    if (VOUCHER_SLUGS.has(slug)) return 'voucher';
    return 'mobile_pc';
}
