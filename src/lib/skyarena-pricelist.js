/**
 * SUMMONERS WAR PRICE LIST
 * Sumber: src/data/Summoners_War_Price_List.csv
 *
 * price_*   = harga JUAL ke pembeli (ditampilkan di toko Yasui)
 * setoran_* = harga MODAL ke supplier (dikirim sebagai `price` saat rekap penjualan di SkyArena)
 *
 * Kolom band di CSV: price_band_1_3, price_band_4_7, price_band_7_30, price_old
 *   (owner konfirmasi band ketiga = hari 8-30 -> kita pakai kunci "band_8_30")
 * setoran kolom     : setoran_price_band_2, _3, _4_30, _old
 *   (setoran band_2 -> band_1_3, band_3 -> band_4_7, band_4_30 -> band_8_30)
 *
 * Nama monster dinormalisasi ke nama RESMI SkyArena (perbaiki salah eja di CSV).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "../data/Summoners_War_Price_List.csv");

// Peta salah-eja -> nama resmi SkyArena (dari hasil matching)
const NAME_FIX = {
    "alexandera": "Alexandra",
    "hanwull": "Hanwul",
    "mokwol": "Mookwol",
    "calestara": "Celestara",
    "jaduel": "Jaduel and Aepiah",
    "miruel": "Miruel and Graciah",
    "qillin slasher dark": "Qilin Slasher",
    "vermillion bird dancer": "Vermilion Bird Dancer",
    // nama dengan elemen disambung -> nama dasar (SkyArena: 1 nama, 2 elemen)
    "werner dark": "Werner", "werner light": "Werner",
    "rick dark": "Rick",
    "tetsuya dark": "Tetsuya",
    "aya light": "Aya",
    "white tiger light": "White Tiger Blade Master",
    "azure dragon light": "Azure Dragon Swordsman",
    "taebaek light": "Taebaek",
    "kai dark": "Kai",
    "shasha dark": "Shasha", "shasha light": "Shasha",
    "old wood dark": "Old Wood", "old wood light": "Old Wood",
};

function parsePrice(s) {
    if (s == null) return null;
    const n = parseFloat(String(s).replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
}

let cache = null;

/** Muat & parse price list. Return: Map<officialNameLower, {name, price:{}, setoran:{}}> */
export function loadPriceList(csvPath = CSV_PATH) {
    if (cache && csvPath === CSV_PATH) return cache;
    const raw = fs.readFileSync(csvPath, "utf8").trim().split("\n");
    const header = raw[0].split(",").map((h) => h.trim());
    const idx = (k) => header.indexOf(k);
    const map = new Map();

    for (const line of raw.slice(1)) {
        const cols = line.split(",");
        const rawName = (cols[idx("monster_name")] || "").trim();
        if (!rawName) continue;
        const fixed = NAME_FIX[rawName.toLowerCase()] || rawName;
        const entry = {
            name: fixed,
            csvName: rawName,
            price: {
                band_1_3: parsePrice(cols[idx("price_band_1_3")]),
                band_4_7: parsePrice(cols[idx("price_band_4_7")]),
                band_8_30: parsePrice(cols[idx("price_band_7_30")]),
                old: parsePrice(cols[idx("price_old")]),
            },
            setoran: {
                band_1_3: parsePrice(cols[idx("setoran_price_band_2")]),
                band_4_7: parsePrice(cols[idx("setoran_price_band_3")]),
                band_8_30: parsePrice(cols[idx("setoran_price_band_4_30")]),
                old: parsePrice(cols[idx("setoran_price_old")]),
            },
        };
        map.set(fixed.toLowerCase(), entry);
    }
    if (csvPath === CSV_PATH) cache = map;
    return map;
}

/** Ambil harga untuk monster (nama resmi SkyArena). Return null bila tidak ada. */
export function getPricesForMonster(monsterName) {
    if (!monsterName) return null;
    const list = loadPriceList();
    return list.get(String(monsterName).toLowerCase()) || null;
}

/** Daftar nama monster di price list yang TIDAK cocok dengan nama resmi SkyArena (untuk dilaporkan). */
export function getUnmatchedNames(officialNames) {
    const list = loadPriceList();
    const official = new Set(officialNames.map((n) => n.toLowerCase()));
    const unmatched = [];
    for (const entry of list.values()) {
        if (!official.has(entry.name.toLowerCase())) unmatched.push(entry.csvName + " -> " + entry.name);
    }
    return unmatched;
}
