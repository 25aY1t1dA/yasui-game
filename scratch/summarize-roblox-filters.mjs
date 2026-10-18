import { readFileSync, writeFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('./roblox-filters.json', import.meta.url)));
const source = JSON.parse(readFileSync(new URL('./roblox-games-with-subs.json', import.meta.url)));
const successful = data.results.filter(result => result.status === 'ok');
const optionCount = result => (result.itemType.item_info_group || []).reduce((sum, group) => sum + (group.item_info || []).filter(item => item && typeof item === 'object').length, 0)
    + ((result.itemType.item_info_group || []).some(group => group.item_info?.length) ? 0 : (result.itemType.item_info || []).filter(item => item && typeof item === 'object').length);
const summary = {
    capturedAt: data.updatedAt,
    plannedTabs: data.totalJobs,
    matchedGames: new Set(data.results.map(result => result.sourceGame)).size,
    successfulTabs: successful.length,
    tabsWithOptions: successful.filter(result => optionCount(result) > 0).length,
    options: successful.reduce((sum, result) => sum + optionCount(result), 0),
    unresolved: data.results.filter(result => result.status !== 'ok').map(({ sourceGame, sourceTab, yasuiGame, error }) => ({ sourceGame, sourceTab, yasuiGame, error })),
    unmatchedSourceGames: source.filter(game => !data.results.some(result => result.sourceGame === game.slug)).map(game => game.slug),
};
writeFileSync(new URL('./roblox-filter-report.json', import.meta.url), JSON.stringify(summary, null, 2));
console.log({ ...summary, unresolved: summary.unresolved.length });
