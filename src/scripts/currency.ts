import { translations } from "../lib/translations";
import { parsePrice, formatRupiah, formatUSD, USD_RATE, IDR_TO_USD_RATE } from "../lib/price";

export function translateKey(key: string, fallback?: string): string {
    const currentLang = (typeof localStorage !== "undefined" ? localStorage.getItem("yasui_lang") : null) || 
        (typeof document !== "undefined" ? document.documentElement.lang : "id") || "id";
    const dict = (translations as Record<string, Record<string, string>>)[currentLang] || (translations as any)["id"];
    if (dict && typeof dict[key] === "string") {
        return dict[key];
    }
    return fallback !== undefined ? fallback : key;
}

// Attach early to window in case any script runs before initCurrencyAndLang
if (typeof window !== "undefined") {
    (window as any).t = translateKey;
    (window as any).IDR_TO_USD_RATE = IDR_TO_USD_RATE;
    (window as any).USD_RATE = IDR_TO_USD_RATE;
}

export function initCurrencyAndLang(serverDefaultCurr = "IDR", serverDefaultLang = "id"): void {
    let storedLang = typeof localStorage !== "undefined" ? localStorage.getItem("yasui_lang") : null;
    let storedCurr = typeof localStorage !== "undefined" ? localStorage.getItem("yasui_currency") : null;

    // Smart Auto-Detection for fresh visitors
    if (!storedLang) {
        const browserLang = (typeof navigator !== "undefined" && (navigator.language || (navigator as any).userLanguage || ""))
            .toLowerCase();
        storedLang = browserLang.startsWith("id") ? "id" : "en";
        try {
            localStorage.setItem("yasui_lang", storedLang);
        } catch {}
    }

    if (!storedCurr) {
        storedCurr = storedLang === "id" ? "IDR" : "USD";
        try {
            localStorage.setItem("yasui_currency", storedCurr);
        } catch {}
    }

    let curr = storedCurr || serverDefaultCurr || "IDR";
    let lang = storedLang || serverDefaultLang || "id";

    // Keep cookies in sync for subsequent SSR requests
    try {
        document.cookie = `yasui_currency=${curr}; path=/; max-age=31536000; SameSite=Lax`;
        document.cookie = `yasui_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}

    const selectCurrency = (newCurr: string) => {
        curr = newCurr;
        try {
            localStorage.setItem("yasui_currency", curr);
            document.cookie = `yasui_currency=${curr}; path=/; max-age=31536000; SameSite=Lax`;
        } catch {}
        updateUI();
        document.dispatchEvent(new CustomEvent("yasui-currency-change", { detail: { currency: curr } }));
    };

    const selectLanguage = (newLang: string) => {
        lang = newLang;
        try {
            localStorage.setItem("yasui_lang", lang);
            document.cookie = `yasui_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
        } catch {}
        document.documentElement.lang = lang;
        updateUI();
        document.dispatchEvent(new CustomEvent("yasui-lang-change", { detail: { language: lang } }));
    };

    const toggleRegionalMenu = () => {
        const menu = document.getElementById("header-regional-menu");
        if (menu) menu.classList.toggle("hidden");
    };

    function updateUI(rootElement?: HTMLElement | Document | null) {
        const scope = rootElement || document;
        const currentCurr = curr || "IDR";
        const currentLang = lang || "id";

        // Update <html> lang attribute if full document
        if (scope === document && document.documentElement) {
            document.documentElement.lang = currentLang;
        }

        // Navbar currency label
        const headerCurrLabel = document.getElementById("header-curr-label");
        if (headerCurrLabel) headerCurrLabel.innerText = currentCurr;

        // Regional switcher modal active states (Currency)
        const optIdr = document.getElementById("curr-opt-idr");
        const optUsd = document.getElementById("curr-opt-usd");
        if (optIdr && optUsd) {
            const activeClass = "border-[#00E5FF] bg-[#00E5FF]/10 text-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.2)]";
            const inactiveClass = "border-[#222634] bg-[#161922] text-[#94A3B8] hover:text-[#F8FAFC]";
            if (currentCurr === "IDR") {
                optIdr.className = `flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${activeClass}`;
                optUsd.className = `flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${inactiveClass}`;
            } else {
                optUsd.className = `flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${activeClass}`;
                optIdr.className = `flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${inactiveClass}`;
            }
        }

        // Regional switcher modal active states (Language)
        const optLangId = document.getElementById("lang-opt-id");
        const optLangEn = document.getElementById("lang-opt-en");
        if (optLangId && optLangEn) {
            const activeClass = "border-[#00E5FF] bg-[#00E5FF]/10 text-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.2)]";
            const inactiveClass = "border-[#222634] bg-[#161922] text-[#94A3B8] hover:text-[#F8FAFC]";
            if (currentLang === "id") {
                optLangId.className = `flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${activeClass}`;
                optLangEn.className = `flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${inactiveClass}`;
            } else {
                optLangEn.className = `flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${activeClass}`;
                optLangId.className = `flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${inactiveClass}`;
            }
        }

        // Footer buttons
        const txt = document.getElementById("currency-text");
        const flag = document.getElementById("currency-flag");
        if (txt && flag) {
            txt.innerText = currentCurr;
            flag.innerText = currentCurr === "USD" ? "$" : "Rp";
        }

        const langTxt = document.getElementById("lang-text");
        if (langTxt) langTxt.innerText = currentLang.toUpperCase();

        // Convert ALL prices with [data-price-idr] or .price-tag or .yg-price inside scope
        scope.querySelectorAll<HTMLElement>(".price-tag, .yg-price, [data-price-idr]").forEach((tag) => {
            let raw = tag.getAttribute("data-price-idr");
            if (!raw) {
                raw = tag.innerText;
                const numericRaw = parsePrice(raw);
                if (numericRaw > 0) {
                    tag.setAttribute("data-price-idr", String(numericRaw));
                    raw = String(numericRaw);
                }
            }
            const numericRaw = parsePrice(raw);
            if (!tag.hasAttribute("data-price-idr")) {
                tag.setAttribute("data-price-idr", String(numericRaw));
            }
            if (!tag.classList.contains("font-mono")) tag.classList.add("font-mono");
            if (!tag.classList.contains("tabular-nums")) tag.classList.add("tabular-nums");

            tag.innerText = currentCurr === "USD"
                ? formatUSD(numericRaw / USD_RATE)
                : formatRupiah(numericRaw);
        });

        // Translate ALL [data-i18n], [data-i18n-placeholder], [data-i18n-title] inside scope
        const dict = (translations as Record<string, Record<string, string>>)[currentLang] || (translations as any)["id"];
        if (dict) {
            scope.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
                const key = el.getAttribute("data-i18n");
                if (key && dict[key]) {
                    const icon = el.querySelector("[class*='i-lucide-'], svg");
                    if (icon && !dict[key].includes("<")) {
                        const iconHtml = icon.outerHTML;
                        el.innerHTML = `${iconHtml} <span>${dict[key]}</span>`;
                    } else {
                        el.innerHTML = dict[key];
                    }
                }
            });

            scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-placeholder]").forEach((el) => {
                const key = el.getAttribute("data-i18n-placeholder");
                if (key && dict[key]) {
                    el.placeholder = dict[key];
                }
            });

            scope.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
                const key = el.getAttribute("data-i18n-title");
                if (key && dict[key]) {
                    el.setAttribute("title", dict[key]);
                }
            });
        }
    }

    // Attach to window for global access
    (window as any).t = translateKey;
    (window as any).selectCurrency = selectCurrency;
    (window as any).selectLanguage = selectLanguage;
    (window as any).toggleRegionalMenu = toggleRegionalMenu;
    (window as any).updateGlobalUI = updateUI;
    (window as any).applyTranslations = (root?: HTMLElement | Document) => updateUI(root);
    (window as any).getCurrentCurrency = () => curr;
    (window as any).getCurrentLanguage = () => lang;
    (window as any).IDR_TO_USD_RATE = IDR_TO_USD_RATE;
    (window as any).USD_RATE = IDR_TO_USD_RATE;
    (window as any).formatMoney = (amountIdr: number | string) => {
        const num = parsePrice(amountIdr);
        return curr === "USD" ? formatUSD(num / USD_RATE) : formatRupiah(num);
    };
    (window as any).formatCurrency = (amountIdr: number | string, customCurr?: string) => {
        const num = parsePrice(amountIdr);
        return (customCurr || curr) === "USD" ? formatUSD(num / USD_RATE) : formatRupiah(num);
    };

    const headerRegBtn = document.getElementById("header-regional-btn");
    if (headerRegBtn) {
        headerRegBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleRegionalMenu();
        };
    }

    document.getElementById("currency-btn")?.addEventListener("click", () => {
        selectCurrency(curr === "IDR" ? "USD" : "IDR");
    });
    document.getElementById("lang-btn")?.addEventListener("click", () => {
        selectLanguage(lang === "id" ? "en" : "id");
    });

    document.addEventListener("click", (e) => {
        const container = document.getElementById("regional-switcher-container");
        const menu = document.getElementById("header-regional-menu");
        if (container && menu && !container.contains(e.target as Node)) {
            menu.classList.add("hidden");
        }
    });

    updateUI();
}
