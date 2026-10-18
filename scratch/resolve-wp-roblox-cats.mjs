#!/usr/bin/env node
/**
 * Resolvers: memetakan slug kategori WP -> game prefix (Itemku slug).
 * TELITI: hanya menghapus kategori yang (a) game prefix-nya terverifikasi dead,
 * atau (b) parent game-nya sudah tidak ada, DAN (c) count === 0.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TYPE_SLUGS = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, "itemku-type-slugs.json"), "utf8")));
const DEAD = new Set([...JSON.parse(fs.readFileSync(path.join(__dirname, "roblox-dead-games-final.json"), "utf8")).dead, "anime-fighters-simulator"]);
const ALIVE = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, "roblox-dead-games-final.json"), "utf8")).alive);

/** coba resolve slug WP -> { game, type } */
export function resolveWpSlug(slug) {
    const parts = slug.split("-");
    // coba dari prefix terpanjang (nama game bisa panjang), sisanya = type
    for (let i = parts.length; i >= 1; i--) {
        const game = parts.slice(0, i).join("-");
        const type = i < parts.length ? parts.slice(i).join("-") : null;
        const bare = game.replace(/-roblox$/, "");
        // game harus dikenal: bentuk apa pun (dengan/tanpa -roblox) di alive/dead
        const gameKnown = [game, bare, `${game}-roblox`, `${bare}-roblox`].some(s => ALIVE.has(s) || DEAD.has(s));
        if (!gameKnown) continue;
        if (type === null) return { game, type: null };
        if (TYPE_SLUGS.has(type)) return { game, type };
        // type tidak dikenal -> prefix lebih pendek mungkin lebih tepat, lanjut loop
    }
    return null;
}

export function gameStatus(wpSlug) {
    const r = resolveWpSlug(wpSlug);
    if (!r) return { known: false };
    const candidates = [r.game, r.game.replace(/-roblox$/, ""), `${r.game.replace(/-roblox$/, "")}-roblox`];
    const isAlive = candidates.some(s => ALIVE.has(s));
    const isDead = candidates.some(s => DEAD.has(s));
    return { known: true, game: r.game, type: r.type, alive: isAlive, dead: isDead };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
    const cats = JSON.parse(fs.readFileSync(path.join(__dirname, "wp-roblox-cats-now.json"), "utf8"));
    const rows = cats.map(c => ({ slug: c.slug, ...gameStatus(c.slug) }));
    const unmatched = rows.filter(r => !r.known);
    const deadGame = rows.filter(r => r.known && r.dead);
    const aliveGame = rows.filter(r => r.known && r.alive);
    console.log(`total=${rows.length} known-alive=${aliveGame.length} known-dead=${deadGame.length} unmatched=${unmatched.length}`);
    console.log("\n--- UNMATCHED (wajib diteliti manual):");
    unmatched.forEach(r => console.log("  ?", r.slug));
    console.log("\n--- DEAD (kandidat hapus):");
    deadGame.forEach(r => console.log(`  ✗ ${r.slug}${r.type ? ` (game=${r.game} type=${r.type})` : " (game-level)"}`));
}
