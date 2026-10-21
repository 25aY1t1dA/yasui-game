import type { APIRoute } from "astro";
import { getCategories, getProducts } from "../lib/wc.js";
import { ROBLOX_SPOTLIGHT_GAMES } from "../data/catalog";

export const prerender = false;

interface SitemapUrl {
    loc: string;
    lastmod?: string;
    changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
    priority: number;
}

const escapeXml = (unsafe: string): string => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case "<": return "&lt;";
            case ">": return "&gt;";
            case "&": return "&amp;";
            case "'": return "&apos;";
            case "\"": return "&quot;";
            default: return c;
        }
    });
};

export const GET: APIRoute = async () => {
    const SITE_URL = "https://yasuigame.com";
    const today = new Date().toISOString().split("T")[0];

    const urls: SitemapUrl[] = [
        { loc: `${SITE_URL}/`, changefreq: "daily", priority: 1.0, lastmod: today },
        { loc: `${SITE_URL}/categories`, changefreq: "daily", priority: 0.9, lastmod: today },
        { loc: `${SITE_URL}/cara-belanja`, changefreq: "weekly", priority: 0.7, lastmod: today },
        { loc: `${SITE_URL}/security-guide`, changefreq: "weekly", priority: 0.7, lastmod: today },
        { loc: `${SITE_URL}/review`, changefreq: "daily", priority: 0.7, lastmod: today },
        { loc: `${SITE_URL}/contact`, changefreq: "monthly", priority: 0.6, lastmod: today },
        { loc: `${SITE_URL}/terms`, changefreq: "monthly", priority: 0.5, lastmod: today },
        { loc: `${SITE_URL}/privacy`, changefreq: "monthly", priority: 0.5, lastmod: today }
    ];

    const addedLocs = new Set(urls.map(u => u.loc));

    // Dynamic Categories
    try {
        const rawCats = await getCategories({ per_page: 100, hide_empty: false });
        if (Array.isArray(rawCats)) {
            rawCats.forEach((cat: any) => {
                if (!cat?.slug) return;
                const slug = cat.slug.trim().toLowerCase();
                if (slug === "flash-sale" || slug === "uncategorized" || slug === "arsip-internal") return;
                
                const loc = `${SITE_URL}/category/${slug}`;
                if (!addedLocs.has(loc)) {
                    addedLocs.add(loc);
                    urls.push({
                        loc,
                        changefreq: "daily",
                        priority: 0.8,
                        lastmod: today
                    });
                }
            });
        }
    } catch (e: any) {
        console.warn("[Sitemap] Failed to fetch WooCommerce categories:", e?.message);
    }

    // Fallback Spotlight Games
    ROBLOX_SPOTLIGHT_GAMES.forEach((game) => {
        const loc = `${SITE_URL}/category/${game.slug}`;
        if (!addedLocs.has(loc)) {
            addedLocs.add(loc);
            urls.push({
                loc,
                changefreq: "daily",
                priority: 0.8,
                lastmod: today
            });
        }
    });

    // Dynamic Products
    try {
        const rawProducts = await getProducts({ per_page: 100, status: "publish" });
        if (Array.isArray(rawProducts)) {
            rawProducts.forEach((p: any) => {
                if (!p?.slug) return;
                const loc = `${SITE_URL}/product/${p.slug.trim()}`;
                if (!addedLocs.has(loc)) {
                    addedLocs.add(loc);
                    const modifiedDate = p.date_modified || p.date_created;
                    const lastmod = modifiedDate ? modifiedDate.split("T")[0] : today;
                    urls.push({
                        loc,
                        changefreq: "daily",
                        priority: 0.8,
                        lastmod
                    });
                }
            });
        }
    } catch (e: any) {
        console.warn("[Sitemap] Failed to fetch WooCommerce products:", e?.message);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority.toFixed(1)}</priority>
  </url>`).join("\n")}
</urlset>`;

    return new Response(xml, {
        status: 200,
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "X-Robots-Tag": "noindex, follow"
        }
    });
};
