// Run in an Itemku browser tab. Supply jobs from roblox-filter-jobs.json.
// Reads public Next.js Flight data as JSON; never evaluates website scripts.
async function collectItemkuFilters(jobs, options = {}) {
    const results = [];
    for (const job of jobs) {
        await new Promise(resolve => setTimeout(resolve, options.skipDelay ? 0 : 8000 + Math.random() * 12000));
        const sourceUrl = `https://www.itemku.com/id/g/${job.sourceGame}/${job.sourceTab}`;
        try {
            const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60000) });
            if (response.status === 429) {
                results.push({ ...job, sourceUrl, status: 'rate_limited', retryAfter: response.headers.get('Retry-After'), capturedAt: new Date().toISOString() });
                break;
            }
            if (response.status === 404) {
                results.push({ ...job, sourceUrl, status: 'source_not_found', httpStatus: 404, capturedAt: new Date().toISOString() });
                continue;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const flight = [...doc.scripts].map(script => {
                const text = script.textContent;
                if (!text.startsWith('self.__next_f.push(')) return '';
                try { const chunk = JSON.parse(text.slice(19, text.lastIndexOf(')'))); return chunk[0] === 1 ? chunk[1] : ''; } catch { return ''; }
            }).join('');
            // Additional UI facets live on productListData (attribute facets, rarity, default filters).
            let facets = null;
            for (const row of flight.split('\n')) {
                try {
                    const value = JSON.parse(row.slice(row.indexOf(':') + 1));
                    (function walk(node) {
                        if (!node || typeof node !== 'object') return;
                        if (node.productListData && typeof node.productListData.selectedItemType === 'object') {
                            facets = {
                                productAttribute: node.productListData.productAttribute || [],
                                servers: node.productListData.gameInfo?.server || [],
                                rarityTypes: node.productListData.rarityTypes ?? null,
                                defaultFilter: node.productListData.defaultFilter ?? null,
                                defaultSortFilter: node.productListData.defaultSortFilter ?? null,
                            };
                        }
                        Object.values(node).forEach(walk);
                    })(value);
                } catch {}
                if (facets) break;
            }
            const marker = '"selectedItemType":';
            const start = flight.indexOf(marker);
            if (start < 0) throw new Error('Missing selectedItemType payload');
            const tail = flight.slice(start + marker.length);
            let depth = 0, quoted = false, escaped = false, end = -1;
            for (let i = 0; i < tail.length; i++) {
                const char = tail[i];
                if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
                if (char === '"') quoted = true;
                else if (char === '{' || char === '[') depth++;
                else if (char === '}' || char === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
            }
            const type = JSON.parse(tail.slice(0, end));
            if (type.slug !== job.sourceTab || type.game_slug !== job.sourceGame) throw new Error('Source identity mismatch');
            // Keep full type metadata: groups, options, facets and any extra attribute configuration.
            results.push({ ...job, sourceUrl, capturedAt: new Date().toISOString(), status: 'ok', itemType: type, facets: facets || {} });
        } catch (error) {
            results.push({ ...job, sourceUrl, capturedAt: new Date().toISOString(), status: 'error', error: String(error) });
        }
    }
    return results;
}

// Resume with persisted results. One worker; randomized delays are for gentle pacing.
async function resumeItemkuFilters(jobs, previous = []) {
    const key = 'yasui_itemku_filter_checkpoint_v2';
    const jobsById = new Map(jobs.map(job => [`${job.sourceGame}/${job.sourceTab}`, job]));
    const applyCurrentMapping = result => ({ ...result, ...(jobsById.get(`${result.sourceGame}/${result.sourceTab}`) || {}) });
    const results = new Map(previous.map(result => [`${result.sourceGame}/${result.sourceTab}`, applyCurrentMapping(result)]));
    try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        for (const result of saved?.results || []) {
            const id = `${result.sourceGame}/${result.sourceTab}`;
            if (!results.has(id) || result.status === 'ok' || results.get(id).status !== 'ok') results.set(id, applyCurrentMapping(result));
        }
    } catch {}
    const state = window.yasuiScrapeState = { running: true, completed: 0, total: jobs.length, current: '', nextRequestAt: null, storageError: null, pendingExport: 0 };
    let pendingExport = [];
    const download = (data, name) => {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    const checkpoint = () => {
        const data = { updatedAt: new Date().toISOString(), totalJobs: jobs.length, results: [...results.values()] };
        window.yasuiScrapeCheckpoint = data;
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (error) { state.storageError = String(error); }
        return data;
    };
    try {
        const savedPending = JSON.parse(localStorage.getItem(`${key}_pending_export`) || '[]');
        if (Array.isArray(savedPending)) pendingExport = savedPending;
    } catch {}
    state.pendingExport = pendingExport.length;
    window.downloadYasuiFilters = () => {
        download(checkpoint(), `roblox-filters-${Date.now()}.json`);
    };
    // Delta exports stay small enough to transfer even after the full catalog exceeds 5 MiB.
    const downloadPending = () => {
        if (!pendingExport.length) return;
        download({ updatedAt: new Date().toISOString(), totalJobs: jobs.length, results: pendingExport }, `roblox-filters-part-${Date.now()}.json`);
        pendingExport = []; state.pendingExport = 0;
        try { localStorage.removeItem(`${key}_pending_export`); } catch {}
    };
    window.downloadYasuiFilterParts = (size = 100) => {
        const all = [...results.values()];
        for (let index = 0; index < all.length; index += size) download({ updatedAt: new Date().toISOString(), totalJobs: jobs.length, results: all.slice(index, index + size) }, `roblox-filters-part-${index / size + 1}-${Date.now()}.json`);
    };
    const wait = async (ms) => { state.nextRequestAt = new Date(Date.now() + ms).toISOString(); await new Promise(resolve => setTimeout(resolve, ms)); };
    let sinceDownload = 0;
    try {
        for (const job of jobs) {
            const id = `${job.sourceGame}/${job.sourceTab}`;
            if (['ok', 'source_not_found'].includes(results.get(id)?.status)) { state.completed++; continue; }
            state.current = id;
            for (let attempt = 0; attempt < 5; attempt++) {
                await wait(8000 + Math.random() * 12000);
                if (state.stopRequested) return;
                const [result] = await collectItemkuFilters([job], { skipDelay: true });
                results.set(id, result); pendingExport.push(result); state.pendingExport = pendingExport.length;
                try { localStorage.setItem(`${key}_pending_export`, JSON.stringify(pendingExport)); } catch (error) { state.storageError = String(error); }
                checkpoint();
                if (result.status === 'rate_limited') {
                    const seconds = Number(result.retryAfter);
                    const headerWait = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Math.max(0, Date.parse(result.retryAfter) - Date.now()) || 0;
                    await wait(Math.max(headerWait, 300000 * 2 ** attempt) + Math.random() * 60000);
                    continue;
                }
                if (result.status === 'error' && attempt < 2) { await wait(30000 * (attempt + 1)); continue; }
                break;
            }
            state.completed++;
            if (++sinceDownload >= 25) { downloadPending(); sinceDownload = 0; }
        }
    } finally {
        state.running = false; state.nextRequestAt = null; checkpoint(); downloadPending();
    }
}
