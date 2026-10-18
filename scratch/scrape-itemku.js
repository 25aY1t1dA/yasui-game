// scrape-itemku-categories.js
// Scraper untuk mengambil sub-kategori dari setiap game di itemku.com
// Jalankan: node scrape-itemku-categories.js

const GAMES = [
  { name: "Mobile Legends", slug: "mobile-legends" },
  { name: "Growtopia", slug: "growtopia" },
  { name: "Garena Free Fire", slug: "free-fire" },
  { name: "Roblox", slug: "roblox" },
  { name: "Genshin Impact", slug: "genshin-impact" },
  { name: "Honkai Star Rail", slug: "honkai-star-rail" },
  { name: "One Piece Bounty Rush", slug: "one-piece-bounty-rush" },
  { name: "Clash of Clans", slug: "clash-of-clans" },
  { name: "Hay Day", slug: "hay-day" },
  { name: "Zenless Zone Zero", slug: "zenless-zone-zero" },
  { name: "Arknight: Endfield", slug: "arknight-endfield" },
  { name: "Bleach: Soul Resonance", slug: "bleach-soul-resonance" },
  { name: "Blue Archive", slug: "blue-archive" },
  { name: "Chaos Zero Nightmare", slug: "chaos-zero-nightmare" },
  { name: "Clash Royale", slug: "clash-royale" },
  { name: "eFootball Mobile", slug: "efootball-mobile" },
  { name: "Epic Seven", slug: "epic-seven" },
  { name: "Summoners War", slug: "summoners-war" },
  { name: "Grand Summoners", slug: "grand-summoners" },
  { name: "Magic Chess: Go Go", slug: "magic-chess-go-go" },
  { name: "Mobile Legends Adventure", slug: "mobile-legends-adventure" },
  { name: "NTE: Neverness to Everness", slug: "nte-neverness-to-everness" },
  { name: "Old School Runescape", slug: "old-school-runescape" },
  { name: "PUBG Mobile", slug: "pubg-mobile" },
  { name: "Rise of Kingdom", slug: "rise-of-kingdom" },
  { name: "Steam", slug: "steam" },
  { name: "Seven Knight Re:BIRTH", slug: "seven-knight-rebirth" },
  { name: "The Seven Deadly Sins: Origin", slug: "the-seven-deadly-sins-origin" },
  { name: "Umamusume: Pretty Derby", slug: "umamusume-pretty-derby" },
  { name: "Wuthering Waves", slug: "wuthering-waves" },
];

// Untuk scraping, kita akan menggunakan browser tool via evaluate
// Script ini akan dijalankan secara interaktif

console.log("=== ITEMKU SUB-CATEGORY SCRAPER ===");
console.log(`Total games to scrape: ${GAMES.length}`);
console.log("");
console.log("Game list:");
GAMES.forEach((g, i) => console.log(`  ${i + 1}. ${g.name} (${g.slug})`));
console.log("");
console.log("Starting scrape...");

export { GAMES };
