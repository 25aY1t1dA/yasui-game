// Scrape sub-categories for all 264 Roblox games from itemku.com
// Uses Playwright to handle the site

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const games = JSON.parse(readFileSync('/Users/unjustice/Market /yasui-game/scratch/roblox-games.json', 'utf8'));
const OUTPUT_PATH = '/Users/unjustice/Market /yasui-game/scratch/roblox-games-with-subs.json';
const PROGRESS_PATH = '/Users/unjustice/Market /yasui-game/scratch/scrape-progress.json';

// Load existing progress if any
let results = [];
let startIndex = 0;
try {
  const progress = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
  results = progress.results;
  startIndex = progress.nextIndex;
  console.log(`Resuming from index ${startIndex} (${results.length} games already scraped)`);
} catch (e) {
  console.log('Starting fresh scrape');
}

const BATCH_SIZE = 20; // Process games in batches

async function scrapeGame(page, game) {
  const url = `https://www.itemku.com/id/g/${game.slug}`;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    if (!response || response.status() >= 400) {
      return { ...game, error: true, subCategories: [{ name: 'Akun', slug: 'akun' }] };
    }
    
    // Wait a bit for JS to render
    await page.waitForTimeout(1500);
    
    // Check if redirected to homepage
    const currentUrl = page.url();
    if (currentUrl === 'https://www.itemku.com/' || currentUrl === 'https://www.itemku.com') {
      return { ...game, error: true, subCategories: [{ name: 'Akun', slug: 'akun' }] };
    }
    
    // Extract sub-categories
    const cats = await page.evaluate((slug) => {
      const links = document.querySelectorAll('a[href*="/id/g/' + slug + '/"]');
      const cats = [];
      const seen = new Set();
      links.forEach(link => {
        const href = link.getAttribute('href');
        const text = link.textContent.trim();
        const regex = new RegExp('/id/g/' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/([^/?#]+)');
        const match = href.match(regex);
        if (match && text && !seen.has(match[1]) && text.length < 50) {
          seen.add(match[1]);
          cats.push({ name: text, slug: match[1] });
        }
      });
      return cats;
    }, game.slug);
    
    // Post-process
    let filtered = cats.filter(c => {
      const lower = (c.name + ' ' + c.slug).toLowerCase();
      return !lower.includes('gaming buddy') && !lower.includes('gaming-buddy');
    });
    
    // Deduplicate by slug
    const dedupMap = new Map();
    filtered.forEach(c => {
      if (!dedupMap.has(c.slug)) dedupMap.set(c.slug, c);
    });
    filtered = Array.from(dedupMap.values());
    
    // Always ensure "Akun" is present
    if (!filtered.some(c => c.slug === 'akun')) {
      filtered.unshift({ name: 'Akun', slug: 'akun' });
    }
    
    return { ...game, subCategories: filtered };
  } catch (err) {
    console.log(`  ERROR for ${game.slug}: ${err.message}`);
    return { ...game, error: true, subCategories: [{ name: 'Akun', slug: 'akun' }] };
  }
}

async function main() {
  console.log(`Total games: ${games.length}`);
  console.log(`Starting from index: ${startIndex}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'id-ID',
  });
  const page = await context.newPage();
  
  // First visit homepage to get cookies
  try {
    await page.goto('https://www.itemku.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    console.log('Homepage loaded, cookies set');
  } catch (e) {
    console.log('Failed to load homepage:', e.message);
  }
  
  for (let i = startIndex; i < games.length; i++) {
    const game = games[i];
    console.log(`[${i + 1}/${games.length}] Scraping: ${game.name} (${game.slug})`);
    
    const result = await scrapeGame(page, game);
    results.push(result);
    
    const status = result.error ? 'ERROR' : `OK (${result.subCategories.length} subs)`;
    console.log(`  -> ${status}`);
    
    // Save progress every BATCH_SIZE games
    if ((i + 1) % BATCH_SIZE === 0 || i === games.length - 1) {
      writeFileSync(PROGRESS_PATH, JSON.stringify({ results, nextIndex: i + 1 }, null, 2));
      console.log(`  [Progress saved: ${results.length} games]`);
    }
    
    // Small delay to be polite
    await page.waitForTimeout(300);
  }
  
  // Write final output
  writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  
  const succeeded = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;
  const totalSubs = results.reduce((sum, r) => sum + r.subCategories.length, 0);
  
  console.log('\n=== SCRAPING COMPLETE ===');
  console.log(`Total games: ${results.length}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total sub-categories: ${totalSubs}`);
  
  await browser.close();
}

main().catch(console.error);
