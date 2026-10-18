/**
 * Fix foto produk SW yang images-nya kosong.
 * Prioritas: screenshot lokal (public/assets/SW_Monster) → fallback swarfarm icon.
 * Jalankan: node --env-file=.env scratch/fix-sw-images.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wcFetch, WP_URL } from "../src/lib/wc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, "../public/assets/SW_Monster");
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const SHOTS = fs.readdirSync(SHOT_DIR).filter(f => f.toLowerCase().endsWith(".png"));
const ALIAS = {
    [norm("Azure Dragon Swordsman")]: "Azure Dragon Swordman.png",
    [norm("Manannan")]: "Mannanan.png",
    [norm("Son Zhang Lao")]: "Son Zang Lao.png",
    [norm("Vancliffe")]: "Vanclife.png",
    [norm("Jessica")]: "Jessice.png",
    ...(Object.fromEntries(SHOTS.filter(f => /^(Dark|Light) /i.test(f)).map(f => {
        const m = f.replace(/\.png$/i, "").match(/^(Dark|Light) (.+)$/i);
        return [norm(`${m[2]} ${m[1]}`), f];
    }))),
};
const shotFor = (name, element) => {
    const a = ALIAS[norm(name)] || ALIAS[norm(`${name} ${element}`)];
    if (a) return a;
    return SHOTS.find(f => norm(f.replace(/\.png$/i, "")) === norm(name)) || null;
};
const wpAuth = "Basic " + Buffer.from(`${process.env.WP_APP_USER}:${process.env.WP_APP_PASSWORD}`).toString("base64");
const mediaCache = new Map();

async function upload(filename, dir) {
    if (mediaCache.has(dir + filename)) return mediaCache.get(dir + filename);
    const buf = fs.readFileSync(path.join(dir, filename));
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "image/png" }), `sw-img-${filename.replace(/\s+/g, "-")}`);
    const up = await fetch(`${WP_URL.replace(/\/+$/, "")}/wp-json/wp/v2/media`, { method: "POST", headers: { Authorization: wpAuth }, body: form });
    if (!up.ok) throw new Error(`upload ${up.status}`);
    const media = await up.json();
    mediaCache.set(dir + filename, media.id);
    return media.id;
}
async function uploadSwarfarm(imageFilename, alt) {
    if (mediaCache.has(imageFilename)) return mediaCache.get(imageFilename);
    const res = await fetch(`https://swarfarm.com/static/herders/images/monsters/${imageFilename}`);
    if (!res.ok) throw new Error(`swarfarm ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "image/png" }), `sw-swrf-${imageFilename}`);
    const up = await fetch(`${WP_URL.replace(/\/+$/, "")}/wp-json/wp/v2/media`, { method: "POST", headers: { Authorization: wpAuth }, body: form });
    if (!up.ok) throw new Error(`upload ${up.status}`);
    const media = await up.json();
    mediaCache.set(imageFilename, media.id);
    return media.id;
}

let page = 1, fixed = 0, stillEmpty = [], done = false;
while (!done) {
    const prods = await wcFetch("products", { params: { category: 18, per_page: 50, page, status: "any", _: Date.now() + page } });
    if (prods.length < 50) done = true;
    for (const p of prods) {
        if ((p.images || []).length > 0) continue;
        // parse "Monster (Element) — REGION — tier"
        const m = p.name.match(/^(.+?) \((Light|Dark)\)/);
        if (!m) { stillEmpty.push(p.name); continue; }
        const shot = shotFor(m[1], m[2]);
        try {
            const mediaId = shot ? await upload(shot, SHOT_DIR) : null;
            const imageFilename = p.meta_data?.find(x => x.key === "_yasui_sw_image_filename")?.value
                || (shot ? null : (await wcFetch(`products/${p.id}`, { params: { context: "edit" } }))?.meta_data?.find(x => x.key === "_yasui_sw_image_filename")?.value);
            const finalId = mediaId || (imageFilename ? await uploadSwarfarm(imageFilename, `${m[1]} ${m[2]}`) : null);
            if (finalId) {
                await wcFetch(`products/${p.id}`, { method: "PUT", body: { images: [{ id: finalId }] } });
                fixed++;
            } else stillEmpty.push(p.name);
        } catch (e) {
            console.error(`✗ ${p.name}: ${e.message?.slice(0, 60)}`);
            stillEmpty.push(p.name);
        }
        await new Promise(r => setTimeout(r, 200));
    }
    page++;
}
console.log(`\nSelesai: ${fixed} foto dipasang, ${stillEmpty.length} masih kosong`);
if (stillEmpty.length) console.log(stillEmpty.slice(0, 10).join("\n"));
