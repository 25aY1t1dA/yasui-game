import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getCategories, getCategoryBySlug } from '../src/lib/wc.js';

const source = JSON.parse(readFileSync(new URL('./roblox-games-with-subs.json', import.meta.url)));
const root = await getCategoryBySlug('roblox');
const live = [];
for (let page = 1; ; page++) {
    const batch = await getCategories({ parent: root.id, per_page: 100, page, hide_empty: false });
    live.push(...batch);
    if (batch.length < 100) break;
}
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const jobs = source.flatMap(game => {
    const target = live.find(cat => cat.slug === game.slug || cat.slug === game.slug.replace(/-roblox$/, '') || normalize(cat.name) === normalize(game.name));
    return target ? game.subCategories.map(tab => ({ game: game.name, sourceGame: game.slug, sourceTab: tab.slug, yasuiGame: target.slug, yasuiGameId: target.id, tabName: tab.name })) : [];
});
const path = new URL('./roblox-filters.json', import.meta.url);
const results = existsSync(path) ? JSON.parse(readFileSync(path)).results : [];
const save = () => writeFileSync(path, JSON.stringify({ updatedAt: new Date().toISOString(), totalJobs: jobs.length, unmatchedGames: source.filter(game => !jobs.some(job => job.sourceGame === game.slug)).map(game => game.slug), results }, null, 2));
createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.itemku.com');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.end(); return; }
    if (req.url === '/jobs') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(jobs.filter(job => !results.some(r => r.sourceGame === job.sourceGame && r.sourceTab === job.sourceTab && r.status === 'ok')))); return; }
    if (req.url === '/result' && req.method === 'POST') {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 5_000_000) { res.writeHead(413).end(); return; } }
        const result = JSON.parse(body);
        const index = results.findIndex(r => r.sourceGame === result.sourceGame && r.sourceTab === result.sourceTab);
        if (index >= 0) results[index] = result; else results.push(result);
        save(); console.log(`${results.length}/${jobs.length} ${result.sourceGame}/${result.sourceTab}: ${result.status}`);
        res.end('ok'); return;
    }
    res.writeHead(404).end();
}).listen(4332, '127.0.0.1', () => console.log(`Collector ready: ${jobs.length} tabs, ${new Set(jobs.map(j => j.sourceGame)).size} matched games`));
