import { readFileSync, writeFileSync } from 'node:fs';

const inputPath = process.argv[2] || new URL('./roblox-filters.json', import.meta.url);
const outputPath = process.argv[3] || new URL('./roblox-filter-schema.json', import.meta.url);
const data = JSON.parse(readFileSync(inputPath, 'utf8'));

const keyPart = value => String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';

const optionKey = (item, duplicates) => {
    const sourceSlug = keyPart(item.slug || item.name);
    return duplicates.has(sourceSlug) ? `${sourceSlug}-${item.id}` : sourceSlug;
};

const normalizeItems = items => {
    const valid = (items || []).filter(item => item && typeof item === 'object' && item.name);
    const counts = valid.reduce((map, item) => map.set(keyPart(item.slug || item.name), (map.get(keyPart(item.slug || item.name)) || 0) + 1), new Map());
    const duplicates = new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
    return valid.map(item => ({
        key: optionKey(item, duplicates),
        name: item.name,
        source: { id: item.id, slug: item.slug || null },
    }));
};

const tabs = data.results.map(result => {
    const base = {
        key: `${result.yasuiGame}/${result.sourceTab}`,
        game: { name: result.game, yasuiSlug: result.yasuiGame, yasuiCategoryId: result.yasuiGameId, sourceSlug: result.sourceGame },
        type: { name: result.tabName, sourceSlug: result.sourceTab, yasuiCategorySlug: `${result.yasuiGame}-${result.sourceTab}` },
        source: { url: result.sourceUrl, capturedAt: result.capturedAt, status: result.status, httpStatus: result.httpStatus || null, error: result.error || null },
        filters: [],
    };
    if (result.status !== 'ok') return base;
    const type = result.itemType;
    base.type.name = type.name || base.type.name;
    base.type.quickFilterConfig = type.quick_filter_config ?? null;
    base.type.itemInfoGroupLabel = type.item_info_group_label ?? null;
    base.type.itemInfoLabel = type.item_info_label ?? null;
    base.source.itemTypeId = type.id;
    for (const group of type.item_info_group || []) {
        const options = normalizeItems(group.item_info);
        if (!options.length) continue;
        base.filters.push({
            key: keyPart(group.slug || group.name || group.id),
            name: group.name,
            kind: 'item_group',
            source: { id: group.id, slug: group.slug || null },
            options,
        });
    }
    // Flight sometimes leaves this as reference strings into grouped options.
    // Only genuine objects are accepted as flat options.
    const flatOptions = normalizeItems(type.item_info);
    if (flatOptions.length && !base.filters.length) {
        base.filters.push({ key: 'items', name: type.item_info_label || type.name || 'Item', kind: 'items', source: { id: type.id, slug: type.slug }, options: flatOptions });
    }
    return base;
});

const statuses = tabs.reduce((counts, tab) => ({ ...counts, [tab.source.status]: (counts[tab.source.status] || 0) + 1 }), {});
const schema = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt: data.updatedAt,
    complete: tabs.length === data.totalJobs && tabs.every(tab => ['ok', 'source_not_found'].includes(tab.source.status)),
    notes: [
        'Source IDs and slugs are provenance only; product assignments must use Yasui-owned keys.',
        'A source_not_found Akun tab remains an intentional Yasui category and has no invented options.',
        'Do not enable exact filters until matching attributes are assigned to Yasui products.',
    ],
    summary: {
        plannedTabs: data.totalJobs,
        tabs: tabs.length,
        statuses,
        tabsWithFilters: tabs.filter(tab => tab.filters.length).length,
        filters: tabs.reduce((sum, tab) => sum + tab.filters.length, 0),
        options: tabs.reduce((sum, tab) => sum + tab.filters.reduce((n, filter) => n + filter.options.length, 0), 0),
    },
    tabs,
};

writeFileSync(outputPath, JSON.stringify(schema, null, 2));
console.log(schema.summary);
