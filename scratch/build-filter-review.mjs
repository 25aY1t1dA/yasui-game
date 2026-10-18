import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const raw = JSON.parse(readFileSync(new URL('./non-roblox-filters-raw.json', import.meta.url)));
const file = new URL('./non-roblox-filters-review.json', import.meta.url);
const old = existsSync(file) ? JSON.parse(readFileSync(file)).tabs : [];
const tabs = raw.map(row => {
    const type = row.selectedItemType;
    const key = type ? `${type.game_slug}/${type.slug}` : row.sourceUrl;
    const previous = old.find(tab => tab.key === key);
    const review = (filter) => {
        const saved = previous?.filters.find(item => item.key === filter.key);
        return { ...filter, gunakan: saved?.gunakan ?? null, komentar: saved?.komentar ?? '' };
    };
    const filters = [];
    for (const attribute of row.productAttribute || []) filters.push(review({ key: `attribute-${attribute.id}`, nama: attribute.label, jenis: 'atribut', pilihan: attribute.configuration?.options || [], konfigurasi: attribute.configuration }));
    const servers = (row.servers || []).filter(server => server.name?.trim());
    if (servers.length) filters.push(review({ key: 'server', nama: 'Server', jenis: 'pilihan', pilihan: servers.map(server => server.name) }));
    for (const group of type?.item_info_group || []) filters.push(review({ key: `group-${group.id}`, nama: group.name, jenis: 'kelompok_item', pilihan: (group.item_info || []).map(item => item.name) }));
    if (Array.isArray(type?.item_info) && type.item_info.length) filters.push(review({ key: 'items', nama: type.item_info_label || 'Item', jenis: 'pilihan', pilihan: type.item_info.map(item => item.name) }));
    return { key, game: type?.game_slug === 'summoners-war' ? 'Summoners War: Sky Arena' : type?.game_name, yasuiSlug: type?.game_slug === 'summoners-war' ? 'summoners-war-sky-arena' : row.yasuiGame || type?.game_slug, tab: type?.name, sumber: row.sourceUrl, status: row.error ? 'gagal_diambil' : 'sudah_diambil', error: row.error, komentar: previous?.komentar || '', filters };
});
writeFileSync(file, JSON.stringify({ petunjuk: 'Isi gunakan: true untuk dipakai, false untuk ditolak, null jika belum diputuskan. Isi komentar untuk perubahan nama, pilihan, atau aturan. Data belum diimpor ke WooCommerce. Daftar kosong bukan bukti semua filter UI tidak ada.', lengkap: false, diperbarui: new Date().toISOString(), tabs }, null, 2));
console.log(`Review saved: ${tabs.length} tabs. Existing decisions preserved.`);
