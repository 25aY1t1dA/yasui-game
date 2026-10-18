import type { RobloxServiceGroup } from "../types";

export const ROBLOX_SERVICE_GROUPS: RobloxServiceGroup[] = [
    {
        key: "robux",
        name: "Robux",
        detail: "Pilih cara top up",
        icon: "i-lucide-gem",
        slugs: ["robux-via-login", "robux-via-username", "robux-5-hari"]
    },
    {
        key: "gift",
        name: "Gift Card",
        detail: "Voucher Roblox",
        icon: "i-lucide-gift",
        slugs: ["robux-game-card", "robux-gift-card", "rbl-credits-gift-card"]
    },
    {
        key: "account",
        name: "Akun Roblox",
        detail: "Akun platform",
        icon: "i-lucide-user-round",
        slugs: ["roblox-akun"]
    }
];

export const ROBLOX_FEATURED_SLUGS: readonly string[] = [
    "blox-fruits",
    "fish-it",
    "grow-a-garden",
    "adopt-me",
    "steal-a-brainrot",
    "99-nights-in-the-forest"
];
