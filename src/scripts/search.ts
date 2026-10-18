let mobileSearchOpen = false;

export function toggleMobileSearch(): void {
    const row = document.getElementById("mobile-search-row");
    const header = document.getElementById("main-header");
    const toggleBtn = document.getElementById("mobile-search-toggle");
    const mobDropdown = document.getElementById("mobile-search-dropdown");
    if (!row) return;

    mobileSearchOpen = !mobileSearchOpen;

    if (mobileSearchOpen) {
        row.classList.remove("max-h-0", "opacity-0");
        row.classList.add("max-h-16", "opacity-100");
        header?.classList.add("border-cyan-500/20");
        setTimeout(() => {
            const input = document.getElementById("mobile-search-input") as HTMLInputElement | null;
            if (input) input.focus();
        }, 200);
        if (toggleBtn) {
            toggleBtn.innerHTML = '<div class="i-lucide-x text-sm"></div>';
            toggleBtn.classList.add("border-cyan-500/50", "text-cyan-400", "bg-cyan-950/30");
        }
    } else {
        row.classList.remove("max-h-16", "opacity-100");
        row.classList.add("max-h-0", "opacity-0");
        header?.classList.remove("border-cyan-500/20");
        if (mobDropdown) mobDropdown.classList.add("hidden");
        if (toggleBtn) {
            toggleBtn.innerHTML = '<div class="i-lucide-search text-sm"></div>';
            toggleBtn.classList.remove("border-cyan-500/50", "text-cyan-400", "bg-cyan-950/30");
        }
    }
}

export function expandMobileSearchRow(): void {
    const row = document.getElementById("mobile-search-row");
    if (row && mobileSearchOpen) {
        row.classList.remove("max-h-16", "overflow-hidden");
        row.classList.add("max-h-96");
    }
}

export function collapseMobileSearchRow(): void {
    const row = document.getElementById("mobile-search-row");
    if (row && mobileSearchOpen) {
        row.classList.add("max-h-16", "overflow-hidden");
        row.classList.remove("max-h-96");
    }
}

function initCategorySearch(inputId: string, dropdownId: string, resultsId: string): void {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    const dropdown = document.getElementById(dropdownId);
    const results = document.getElementById(resultsId);
    if (!input || !dropdown || !results) return;

    const isMobileSearch = inputId === "mobile-search-input";
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let activeIndex = -1;
    let searchVersion = 0;
    const escapeSearchText = (value: any) =>
        String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char] || char));

    function hideDropdown() {
        dropdown?.classList.add("hidden");
        activeIndex = -1;
        if (isMobileSearch) {
            collapseMobileSearchRow();
        }
    }

    function showDropdown() {
        dropdown?.classList.remove("hidden");
        if (isMobileSearch) {
            expandMobileSearchRow();
        }
    }

    function renderResults(categories: any[], _query: string) {
        if (!results) return;
        if (!categories || categories.length === 0) {
            results.innerHTML = `
                <div class="px-4 py-6 text-center">
                    <div class="i-lucide-search-x text-2xl text-gray-600 mx-auto mb-2"></div>
                    <p class="text-xs text-gray-500 font-mono">Game tidak ditemukan</p>
                    <p class="text-[10px] text-gray-600 mt-1">Coba kata kunci lain</p>
                </div>`;
            return;
        }

        results.innerHTML = categories.map((cat, i) => `
            <a
                href="/category/${encodeURIComponent(cat.slug)}"
                class="search-result-item flex items-center gap-3 px-4 py-3 hover:bg-cyan-950/30 border-b border-gray-800/50 last:border-0 transition group cursor-pointer ${i === activeIndex ? 'bg-cyan-950/30' : ''}"
                data-index="${i}"
            >
                <div class="w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    ${cat.image
                        ? `<img src="/img-proxy?src=${encodeURIComponent(cat.image)}" alt="${escapeSearchText(cat.name)}" class="w-full h-full object-cover" />`
                        : `<div class="i-lucide-gamepad-2 text-sm text-gray-600"></div>`
                    }
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-white group-hover:text-cyan-400 transition truncate">${escapeSearchText(cat.name)}</div>
                    <div class="text-[10px] text-gray-500 font-mono">${escapeSearchText(cat.label)}</div>
                </div>
                <div class="i-lucide-chevron-right text-xs text-gray-600 group-hover:text-cyan-400 transition flex-shrink-0"></div>
            </a>
        `).join("");
    }

    async function searchCategories(query: string) {
        const version = ++searchVersion;
        activeIndex = -1;
        if (!query || query.length < 2) {
            hideDropdown();
            return;
        }

        results!.innerHTML = `
            <div class="px-4 py-4 text-center">
                <div class="inline-block w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-[10px] text-gray-500 mt-2 font-mono">Mencari game...</p>
            </div>`;
        showDropdown();

        try {
            const res = await fetch(`/api/search-categories?q=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error("Search failed");
            const data = await res.json();
            if (version !== searchVersion || input!.value.trim() !== query) return;
            renderResults(data.categories || [], query);
        } catch {
            if (version !== searchVersion || input!.value.trim() !== query) return;
            results!.innerHTML = `
                <div class="px-4 py-4 text-center">
                    <p class="text-xs text-red-400 font-mono">Gagal memuat hasil</p>
                </div>`;
        }
    }

    input.addEventListener("input", function() {
        if (debounceTimer) clearTimeout(debounceTimer);
        searchVersion++;
        results.innerHTML = "";
        hideDropdown();
        const q = this.value.trim();
        debounceTimer = setTimeout(() => searchCategories(q), 250);
    });

    input.addEventListener("keydown", function(e) {
        const items = results.querySelectorAll<HTMLAnchorElement>(".search-result-item");
        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            items.forEach((el, i) => el.classList.toggle("bg-cyan-950/30", i === activeIndex));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            items.forEach((el, i) => el.classList.toggle("bg-cyan-950/30", i === activeIndex));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (activeIndex >= 0 && items[activeIndex]) {
                window.location.href = items[activeIndex].href;
            } else if (items.length > 0) {
                window.location.href = items[0].href;
            }
        } else if (e.key === "Escape") {
            hideDropdown();
            input.blur();
        }
    });

    input.addEventListener("focus", function() {
        if (this.value.trim().length >= 2) {
            searchCategories(this.value.trim());
        }
    });

    document.addEventListener("click", function(e) {
        if (!input.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
            hideDropdown();
        }
    });
}

export function initGlobalSearch(): void {
    (window as any).toggleMobileSearch = toggleMobileSearch;
    (window as any).expandMobileSearchRow = expandMobileSearchRow;
    (window as any).collapseMobileSearchRow = collapseMobileSearchRow;

    initCategorySearch("desktop-search-input", "desktop-search-dropdown", "desktop-search-results");
    initCategorySearch("mobile-search-input", "mobile-search-dropdown", "mobile-search-results");

    let lastScrollY = 0;
    window.addEventListener("scroll", () => {
        if (mobileSearchOpen && Math.abs(window.scrollY - lastScrollY) > 60) {
            toggleMobileSearch();
        }
        lastScrollY = window.scrollY;
    }, { passive: true });
}
