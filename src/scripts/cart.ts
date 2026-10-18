export function updateGlobalCartBadge(): void {
    try {
        const raw = localStorage.getItem("yasui_cart") || "[]";
        const cart = JSON.parse(raw);
        const count = Array.isArray(cart) ? cart.length : 0;

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

export function initCartBadgeSync(): void {
    updateGlobalCartBadge();
    window.addEventListener("storage", updateGlobalCartBadge);
    document.addEventListener("yasui-cart-changed", updateGlobalCartBadge);
}
