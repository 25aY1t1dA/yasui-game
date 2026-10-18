import { translations } from "../lib/translations";

const USD_RATE = 16000;

function parsePrice(priceStr: string | number | null | undefined): number {
    if (!priceStr) return 0;
    let str = String(priceStr).trim();
    if (/^\d+$/.test(str)) return parseInt(str, 10);
    if (str.match(/[,.]00$/)) {
        str = str.substring(0, str.length - 3);
    }
    const clean = str.replace(/\D/g, "");
    return parseInt(clean, 10) || 0;
}

function formatRupiah(amount: number): string {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0
    }).format(amount);
}

function formatUSD(amount: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
    }).format(amount);
}

export function initCurrencyAndLang(serverDefaultCurr = "IDR", serverDefaultLang = "id"): void {
    let curr = localStorage.getItem("yasui_currency") || serverDefaultCurr || "IDR";
    let lang = localStorage.getItem("yasui_lang") || serverDefaultLang || "id";

    if (!localStorage.getItem("yasui_currency")) {
        localStorage.setItem("yasui_currency", curr);
    }
    if (!localStorage.getItem("yasui_lang")) {
        localStorage.setItem("yasui_lang", lang);
    }

    const selectCurrency = (newCurr: string) => {
        curr = newCurr;
        localStorage.setItem("yasui_currency", curr);
        document.cookie = `yasui_currency=${curr}; path=/; max-age=31536000; SameSite=Lax`;
        updateUI();
        document.dispatchEvent(new CustomEvent("yasui-currency-change", { detail: { currency: curr } }));
    };

    const selectLanguage = (newLang: string) => {
        lang = newLang;
        localStorage.setItem("yasui_lang", lang);
        document.cookie = `yasui_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
        updateUI();
        document.dispatchEvent(new CustomEvent("yasui-lang-change", { detail: { language: lang } }));
    };

    const toggleRegionalMenu = () => {
        const menu = document.getElementById("header-regional-menu");
        if (menu) menu.classList.toggle("hidden");
    };

    function updateUI() {
        const currentCurr = curr || "IDR";
        const currentLang = lang || "id";

        const headerCurrLabel = document.getElementById("header-curr-label");
        if (headerCurrLabel) headerCurrLabel.innerText = currentCurr;

        const optIdr = document.getElementById("curr-opt-idr");
        const optUsd = document.getElementById("curr-opt-usd");
        if (optIdr && optUsd) {
            const activeClass = "border-cyan-400 bg-cyan-950/40 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]";
            const inactiveClass = "border-gray-800 bg-black/40 text-gray-400 hover:text-white";
            if (currentCurr === "IDR") {
                optIdr.classList.add(...activeClass.split(" "));
                optIdr.classList.remove(...inactiveClass.split(" "));
                optUsd.classList.add(...inactiveClass.split(" "));
                optUsd.classList.remove(...activeClass.split(" "));
            } else {
                optUsd.classList.add(...activeClass.split(" "));
                optUsd.classList.remove(...inactiveClass.split(" "));
                optIdr.classList.add(...inactiveClass.split(" "));
                optIdr.classList.remove(...activeClass.split(" "));
            }
        }

        const optLangId = document.getElementById("lang-opt-id");
        const optLangEn = document.getElementById("lang-opt-en");
        if (optLangId && optLangEn) {
            const activeClass = "border-cyan-400 bg-cyan-950/40 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]";
            const inactiveClass = "border-gray-800 bg-black/40 text-gray-400 hover:text-white";
            if (currentLang === "id") {
                optLangId.classList.add(...activeClass.split(" "));
                optLangId.classList.remove(...inactiveClass.split(" "));
                optLangEn.classList.add(...inactiveClass.split(" "));
                optLangEn.classList.remove(...activeClass.split(" "));
            } else {
                optLangEn.classList.add(...activeClass.split(" "));
                optLangEn.classList.remove(...inactiveClass.split(" "));
                optLangId.classList.add(...inactiveClass.split(" "));
                optLangId.classList.remove(...activeClass.split(" "));
            }
        }

        const txt = document.getElementById("currency-text");
        const flag = document.getElementById("currency-flag");
        if (txt && flag) {
            txt.innerText = currentCurr;
            flag.innerText = currentCurr === "USD" ? "$" : "Rp";
        }

        document.querySelectorAll<HTMLElement>(".price-tag").forEach((tag) => {
            let raw = tag.getAttribute("data-price-idr");
            if (!raw) raw = tag.innerText;
            const numericRaw = parsePrice(raw);
            tag.setAttribute("data-price-idr", String(numericRaw));
            tag.innerText = currentCurr === "USD"
                ? formatUSD(numericRaw / USD_RATE)
                : formatRupiah(numericRaw);
        });

        const langTxt = document.getElementById("lang-text");
        if (langTxt) langTxt.innerText = currentLang.toUpperCase();

        const dict = (translations as Record<string, Record<string, string>>)[currentLang] || (translations as any)["id"];
        if (dict) {
            document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
                const key = el.getAttribute("data-i18n");
                if (key && dict[key]) {
                    if (el instanceof HTMLInputElement && el.hasAttribute("placeholder")) {
                        el.setAttribute("placeholder", dict[key]);
                    } else {
                        el.innerHTML = dict[key];
                    }
                }
            });
        }
    }

    // Attach to window for compatibility with existing template callbacks
    (window as any).selectCurrency = selectCurrency;
    (window as any).selectLanguage = selectLanguage;
    (window as any).toggleRegionalMenu = toggleRegionalMenu;
    (window as any).updateGlobalUI = updateUI;

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
