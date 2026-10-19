import { initCurrencyAndLang } from "./currency";
import { initCartBadgeSync } from "./cart";
import { initAuth } from "./auth";
import { initGlobalSearch } from "./search";
import { initLiveChat } from "./chat";

function initApp(): void {
    const config = (window as any).__YASUI_CONFIG__ || {};

    try {
        initCurrencyAndLang(config.curr || "IDR", config.lang || "id");
    } catch (err) {
        console.error("[App] Currency/Lang init error:", err);
    }

    try {
        initCartBadgeSync();
    } catch (err) {
        console.error("[App] Cart badge sync error:", err);
    }

    try {
        initAuth();
    } catch (err) {
        console.error("[App] Auth init error:", err);
    }

    try {
        initGlobalSearch();
    } catch (err) {
        console.error("[App] Global search init error:", err);
    }

    try {
        initLiveChat();
    } catch (err) {
        console.error("[App] Live chat init error:", err);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}

document.addEventListener("astro:page-load", initApp);

