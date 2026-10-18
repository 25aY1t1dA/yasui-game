import { readFileSync, writeFileSync } from 'node:fs';

const [basePath = 'scratch/roblox-filters.json', ...partPaths] = process.argv.slice(2);
if (!partPaths.length) {
    console.error('Usage: node scratch/merge-roblox-filter-parts.mjs <base.json> <part.json> [...]');
    process.exit(1);
}

const base = JSON.parse(readFileSync(basePath, 'utf8'));
const jobs = JSON.parse(readFileSync(new URL('./roblox-filter-jobs.json', import.meta.url), 'utf8'));
const jobsById = new Map(jobs.map(job => [`${job.sourceGame}/${job.sourceTab}`, job]));
const applyCurrentMapping = result => ({ ...result, ...(jobsById.get(`${result.sourceGame}/${result.sourceTab}`) || {}) });
const results = new Map((base.results || []).map(result => [`${result.sourceGame}/${result.sourceTab}`, result]));
let newest = base.updatedAt || '';

for (const path of partPaths) {
    const part = JSON.parse(readFileSync(path, 'utf8'));
    if (part.updatedAt > newest) newest = part.updatedAt;
    for (const result of part.results || []) {
        const key = `${result.sourceGame}/${result.sourceTab}`;
        const current = results.get(key);
        if (!current || result.status === 'ok' || current.status !== 'ok') results.set(key, applyCurrentMapping(result));
    }
}

const merged = { ...base, updatedAt: newest || new Date().toISOString(), results: [...results.values()].map(applyCurrentMapping) };
writeFileSync(basePath, JSON.stringify(merged, null, 2));
console.log(`Merged ${partPaths.length} part(s): ${merged.results.length}/${merged.totalJobs} results`);
