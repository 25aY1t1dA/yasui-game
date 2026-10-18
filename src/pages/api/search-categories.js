import { getCategories } from "../../lib/wc";
import { searchScore } from "../../lib/search";

let cached = [];
let expires = 0;
let pending;
async function categoryIndex() {
    if (Date.now() < expires) return cached;
    if (!pending) pending = (async () => {
        const all = [];
        for (let page = 1; page <= 5; page++) {
            const batch = await getCategories({ per_page: 100, page, hide_empty: false });
            all.push(...batch);
            if (batch.length < 100) break;
        }
        const roblox = all.find((cat) => cat.slug === "roblox");
        const services = new Set(["robux-via-login", "robux-via-username", "robux-game-card", "robux-gift-card", "roblox-akun", "rbl-credits-gift-card", "robux-5-hari"]);
        const hiddenRoots = new Set(["flash-sale", "uncategorized", "arsip-internal"]);
        cached = all.filter((cat) => (cat.parent ? cat.parent === roblox?.id && !services.has(cat.slug) : !hiddenRoots.has(cat.slug)));
        expires = Date.now() + 60_000;
        return cached;
    })().finally(() => { pending = null; });
    return pending;
}

export async function GET({ request }) {
    const query = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 120);
    const headers = { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" };
    if (query.length < 2) return new Response(JSON.stringify({ categories: [] }), { headers });
    try {
        const categories = (await categoryIndex()).map((cat) => ({ cat, score: searchScore(cat.name, query) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.cat.name.localeCompare(b.cat.name)).slice(0, 8).map(({ cat }) => ({ id: cat.id, name: cat.name, slug: cat.slug, image: cat.image?.src || null, label: cat.parent ? "Game Roblox" : "Game / platform" }));
        return new Response(JSON.stringify({ categories }), { headers });
    } catch (error) {
        console.error("Category search failed:", error);
        return new Response(JSON.stringify({ categories: [], error: "Search failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
