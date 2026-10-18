import { readFileSync, writeFileSync } from 'node:fs';
import { getCategoryBySlug, getCategories } from '../../src/lib/wc.js';

const jobs = JSON.parse(readFileSync(new URL('./roblox-filter-jobs.json', import.meta.url), 'utf8'));
const grouped = new Map();
for (const job of jobs) {
    if (!grouped.has(job.yasuiGame)) grouped.set(job.yasuiGame, []);
    grouped.get(job.yasuiGame).push(job);
}

const report = { checkedAt: new Date().toISOString(), checkedTabs: 0, matchedTabs: 0, missingGames: [], missingTabs: [], extraTabs: [], nameDifferences: [] };
const decode = value => String(value).replace(/&amp;/g, '&').replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"');

for (const [gameSlug, gameJobs] of grouped) {
    const game = await getCategoryBySlug(gameSlug);
    if (!game) {
        report.missingGames.push(gameSlug);
        continue;
    }
    const children = await getCategories({ parent: game.id, per_page: 100, hide_empty: false });
    const bySlug = new Map(children.map(child => [child.slug, child]));
    for (const job of gameJobs) {
        report.checkedTabs++;
        const expectedSlug = `${gameSlug}-${job.sourceTab}`;
        const category = bySlug.get(expectedSlug);
        if (!category) {
            report.missingTabs.push({ source: `${job.sourceGame}/${job.sourceTab}`, expectedSlug });
            continue;
        }
        report.matchedTabs++;
        if (decode(category.name) !== decode(job.tabName)) report.nameDifferences.push({ source: `${job.sourceGame}/${job.sourceTab}`, sourceName: job.tabName, yasuiSlug: category.slug, yasuiName: category.name });
    }
    for (const child of children) {
        if (!gameJobs.some(job => `${gameSlug}-${job.sourceTab}` === child.slug)) report.extraTabs.push({ game: gameSlug, yasuiSlug: child.slug, yasuiName: child.name });
    }
}

report.valid = !report.missingGames.length && !report.missingTabs.length && !report.extraTabs.length;
writeFileSync(new URL('./roblox-filter-mapping-report.json', import.meta.url), JSON.stringify(report, null, 2));
console.log({ valid: report.valid, checkedTabs: report.checkedTabs, matchedTabs: report.matchedTabs, missingGames: report.missingGames.length, missingTabs: report.missingTabs.length, extraTabs: report.extraTabs.length, nameDifferences: report.nameDifferences.length });
