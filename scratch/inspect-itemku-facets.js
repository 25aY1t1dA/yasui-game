// Parse public Flight JSON records, retaining attribute facets as well as item lists.
function inspectItemkuFacets(html, sourceUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const flight = [...doc.scripts].map(script => {
        if (!script.textContent.startsWith('self.__next_f.push(')) return '';
        try { const chunk = JSON.parse(script.textContent.slice(19, script.textContent.lastIndexOf(')'))); return chunk[0] === 1 ? chunk[1] : ''; } catch { return ''; }
    }).join('');
    let data, messages;
    function walk(value) {
        if (!value || typeof value !== 'object') return;
        if (value.productListData && typeof value.productListData.selectedItemType === 'object') data = value.productListData;
        if (value.initialMessages && typeof value.initialMessages === 'object') messages = value.initialMessages;
        Object.values(value).forEach(walk);
    }
    for (const row of flight.split('\n')) {
        try { walk(JSON.parse(row.slice(row.indexOf(':') + 1))); } catch {}
    }
    if (!data || typeof data.selectedItemType !== 'object') throw new Error('Missing concrete productListData');
    return {
        sourceUrl, capturedAt: new Date().toISOString(),
        selectedItemType: data.selectedItemType,
        productAttribute: (data.productAttribute || []).map(attribute => ({ ...attribute, label: messages?.[attribute.translation_key] || attribute.translation_key })),
        servers: data.gameInfo?.server || [],
        tabs: data.gameInfo?.item_type || [],
        relatedFilterFields: Object.fromEntries(Object.entries(data).filter(([key]) => /filter|rarity|attribute/i.test(key))),
    };
}
