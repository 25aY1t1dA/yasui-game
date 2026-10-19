// src/scripts/cart.ts
// Comprehensive Cart Manager & Order Target Formatting

export type SubCategoryMode = 'account' | 'roblox_item' | 'game_gift' | 'topup_gamepass';

export interface OrderMeta {
    subCategoryMode: SubCategoryMode;
    quantity: number;
    variantName?: string;
    robloxUsername?: string;
    deliveryMethod?: string;
    gameUid?: string;
    gameZone?: string;
    inGameNickname?: string;
    gamepassTaxCalc?: {
        nominalRobux?: number;
        requiredGamepassPrice?: number;
    };
    rawTargetInfo?: string;
}

export interface CartItem {
    id: number;
    globalId?: string;
    name: string;
    slug: string;
    price: number;
    unitPrice: number;
    quantity: number;
    image?: string;
    email?: string;
    wa?: string;
    contactMethod?: string;
    contactValue?: string;
    mode?: SubCategoryMode;
    orderMeta?: OrderMeta;
    // Legacy compatibility fields
    robloxUsername?: string;
    deliveryMethod?: string;
    gameUserId?: string;
    gameZoneId?: string;
    gameNickname?: string;
    playerInGameId?: string;
    selected?: boolean;
    timestamp?: number;
}

/**
 * Format human-readable order target information for cart, checkout, and admin note
 */
export function formatOrderTargetInfo(item: any, lang: string = "id"): string {
    if (!item) return "";
    const meta: OrderMeta = item.orderMeta || ({} as OrderMeta);
    const mode: SubCategoryMode = meta.subCategoryMode || item.mode || "account";
    const qty = meta.quantity || item.quantity || 1;

    const robloxUser = meta.robloxUsername || item.robloxUsername || "";
    const deliveryMethod = meta.deliveryMethod || item.deliveryMethod || "";
    const gameUid = meta.gameUid || item.gameUserId || "";
    const gameZone = meta.gameZone || item.gameZoneId || "";
    const gameNick = meta.inGameNickname || item.gameNickname || "";

    if (mode === "roblox_item") {
        const methodLabel = deliveryMethod === "direct_gift"
            ? (lang === "en" ? "Direct Gift In-Game" : "Direct Gift In-Game")
            : (lang === "en" ? "Private Server Trade" : "Trade di Private Server");
        return `Target: ${robloxUser || "@User"} • Metode: ${methodLabel} • Qty: ${qty}x`;
    }

    if (mode === "topup_gamepass") {
        if (robloxUser) {
            if (deliveryMethod === "via_gamepass_link") {
                const taxPart = meta.gamepassTaxCalc?.requiredGamepassPrice 
                    ? ` (Set ${meta.gamepassTaxCalc.requiredGamepassPrice} R$)` 
                    : " (Pajak 30%)";
                return `Target: ${robloxUser} • Metode: Link Gamepass${taxPart} • Qty: ${qty}x`;
            }
            return `Target: ${robloxUser} • Metode: Gift In-Game • Qty: ${qty}x`;
        }
        if (gameUid) {
            const nickPart = gameNick ? ` • Nick: ${gameNick}` : "";
            return `UID: ${gameUid}${gameZone ? ` (${gameZone})` : ""}${nickPart} • Qty: ${qty}x`;
        }
    }

    if (mode === "game_gift" || (gameUid && gameZone)) {
        const nickPart = gameNick ? ` • Nick: ${gameNick}` : "";
        return `UID: ${gameUid || "-"}${gameZone ? ` (${gameZone})` : ""}${nickPart} • Qty: ${qty}x`;
    }

    if (item.playerInGameId) {
        return `${item.playerInGameId} • Qty: ${qty}x`;
    }

    return lang === "en" 
        ? `Instant Delivery via Email • Qty: ${qty}x` 
        : `Kredensial Login via Email • Qty: ${qty}x`;
}

/**
 * Retrieve current cart from localStorage safely
 */
export function getCart(): CartItem[] {
    try {
        const raw = localStorage.getItem("yasui_cart") || "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Save cart to localStorage and trigger reactive event
 */
export function saveCart(cart: CartItem[]): void {
    try {
        localStorage.setItem("yasui_cart", JSON.stringify(cart));
        window.dispatchEvent(new Event("storage"));
        document.dispatchEvent(new CustomEvent("yasui-cart-changed", { detail: { cart } }));
    } catch (e) {
        console.warn("[Cart] Failed to save cart:", e);
    }
}

/**
 * Add or append an item to the shopping cart
 */
export function addToCart(item: CartItem): void {
    const cart = getCart();
    cart.push(item);
    saveCart(cart);
    updateGlobalCartBadge();
}

/**
 * Update global and mobile cart counter badges
 */
export function updateGlobalCartBadge(): void {
    try {
        const cart = getCart();
        const count = cart.length;

        const badge = document.getElementById("global-cart-badge");
        const mobileBadge = document.getElementById("mobile-cart-badge");

        if (badge) {
            badge.innerText = String(count);
            badge.classList.toggle("hidden", count === 0);
        }
        if (mobileBadge) {
            mobileBadge.innerText = String(count);
            mobileBadge.classList.toggle("hidden", count === 0);
        }
    } catch {
        // Ignored
    }
}

/**
 * Initialize event listeners for reactive badge sync and expose globals
 */
export function initCartBadgeSync(): void {
    updateGlobalCartBadge();
    window.addEventListener("storage", updateGlobalCartBadge);
    document.addEventListener("yasui-cart-changed", updateGlobalCartBadge);

    // Expose helpers on window for client scripts
    if (typeof window !== "undefined") {
        (window as any).formatOrderTargetInfo = formatOrderTargetInfo;
        (window as any).getYasuiCart = getCart;
        (window as any).saveYasuiCart = saveCart;
        (window as any).addYasuiCartItem = addToCart;
    }
}
