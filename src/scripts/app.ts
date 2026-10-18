import { initCurrencyAndLang } from "./currency";
import { initCartBadgeSync } from "./cart";
import { initAuth } from "./auth";
import { initGlobalSearch } from "./search";
import { initLiveChat } from "./chat";

function initApp(): void {
    const config = (window as any).__YASUI_CONFIG__ || {};
    initCurrencyAndLang(config.curr || "IDR", config.lang || "id");
    initCartBadgeSync();
    initAuth();
    initGlobalSearch();
    initLiveChat();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}

document.addEventListener("astro:page-load", initApp);
