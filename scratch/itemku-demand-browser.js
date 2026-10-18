/**
 * Itemku Demand Scraper — mengukur demand per game & item type.
 * Menjalankan ulang inspect seperti filter scraper tetapi hanya mengambil ringkasan:
 *   - jumlah listing per item type (dari item_info_group? tidak ada) -> gunakan jumlah total listing game dari Flight data.
 * Data sumber: halaman game https://www.itemku.com/id/g/<slug> (tab pertama) dan halaman /all.
 * Setiap job mem-poll 1 halaman products?itemType=X dan membaca meta dari productListData:
 *   productListData.totalProduct / pagination.total / etc (dinamis, kita cari kandidat angka).
 *
 * Jalankan di konsol tab itemku.com:
 *   itemkuDemandScraper(window.yasuiDemandJobs.jobs)
 * Checkpoint: localStorage.yasui_itemku_demand_checkpoint_v1
 */
(function () {
  if (window.yasuiDemandScraper) { console.log('[demand] sudah terpasang'); return; }

  const LS_KEY = 'yasui_itemku_demand_checkpoint_v1';
  const state = {
    results: [],
    jobs: [],
    running: false,
    stopRequested: false,
    completed: 0,
    total: 0,
    current: null,
  };

  function loadCheckpoint() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const cp = JSON.parse(raw);
      if (!cp || !Array.isArray(cp.results)) return false;
      state.results = cp.results;
      console.log(`[demand] checkpoint dimuat: ${cp.results.length} hasil (updatedAt ${cp.updatedAt})`);
      return true;
    } catch (e) { console.warn('[demand] checkpoint gagal dimuat', e); return false; }
  }
  function saveCheckpoint() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ updatedAt: new Date().toISOString(), results: state.results }));
    } catch (e) { console.warn('[demand] checkpoint gagal disimpan', e); }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function extractNumbers(value, out, depth) {
    if (!value || typeof value !== 'object' || depth > 6) return;
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'number' && /total|count|amount/i.test(k) && v >= 0 && Number.isFinite(v)) out[k] = Math.max(out[k] || 0, v);
      else if (v && typeof v === 'object') extractNumbers(v, out, depth + 1);
    }
  }

  async function inspectGame(job) {
    const res = await fetch(job.gameUrl, { headers: { accept: 'text/html' } });
    if (res.status === 404) return { status: 'source_not_found' };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const flight = [...doc.scripts].map((s) => {
      const t = s.textContent || '';
      if (!t.startsWith('self.__next_f.push(')) return '';
      try { const c = JSON.parse(t.slice(19, t.lastIndexOf(')'))); return c[0] === 1 ? c[1] : ''; } catch { return ''; }
    }).join('\n');

    let itemTypes = null;
    let numbers = {};
    for (const row of flight.split('\n')) {
      try {
        const v = JSON.parse(row.slice(row.indexOf(':') + 1));
        (function walk(n) {
          if (!n || typeof n !== 'object') return;
          if (n.gameInfo && Array.isArray(n.gameInfo.item_type)) itemTypes = n.gameInfo.item_type;
          extractNumbers(n, numbers, 0);
          Object.values(n).forEach(walk);
        })(v);
      } catch {}
    }
    if (!itemTypes) return { status: 'no_item_type', numbers };
    const types = itemTypes.map((t) => ({ slug: t.slug, name: t.name }));
    return { status: 'ok', types, numbers };
  }

  async function countListings(game, typeSlug) {
    const url = `https://www.itemku.com/id/g/${game}/${typeSlug}`;
    const res = await fetch(url, { headers: { accept: 'text/html' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const flight = [...doc.scripts].map((s) => {
      const t = s.textContent || '';
      if (!t.startsWith('self.__next_f.push(')) return '';
      try { const c = JSON.parse(t.slice(19, t.lastIndexOf(')'))); return c[0] === 1 ? c[1] : ''; } catch { return ''; }
    }).join('\n');
    let total = null;
    for (const row of flight.split('\n')) {
      try {
        const v = JSON.parse(row.slice(row.indexOf(':') + 1));
        (function walk(n) {
          if (!n || typeof n !== 'object' || total !== null) return;
          for (const [k, val] of Object.entries(n)) {
            if (k === 'productListData' && val && typeof val === 'object') {
              for (const [k2, v2] of Object.entries(val)) {
                if (typeof v2 === 'number' && /total/i.test(k2)) total = Math.max(total || 0, v2);
              }
            }
          }
          Object.values(n).forEach(walk);
        })(v);
      } catch {}
    }
    return total;
  }

  async function runAll(jobs) {
    if (state.running) { console.warn('[demand] masih berjalan'); return; }
    state.jobs = jobs;
    state.total = jobs.length;
    state.running = true;
    state.stopRequested = false;
    loadCheckpoint();
    const done = new Set(state.results.map((r) => r.sourceGame));
    console.log(`[demand] mulai: ${jobs.length} game, ${done.size} sudah selesai (checkpoint).`);
    for (const job of jobs) {
      if (state.stopRequested) { console.warn('[demand] DIHENTIKAN oleh stopRequested'); break; }
      if (done.has(job.sourceGame)) continue;
      state.current = job.sourceGame;
      try {
        const inspect = await inspectGame(job);
        const counts = {};
        if (inspect.status === 'ok') {
          for (const t of inspect.types) {
            if (state.stopRequested) break;
            const n = await countListings(job.sourceGame, t.slug);
            counts[t.slug] = n;
            await sleep(300 + Math.random() * 400);
          }
        }
        state.results.push({ sourceGame: job.sourceGame, gameUrl: job.gameUrl, capturedAt: new Date().toISOString(), ...inspect, counts });
        console.log(`[demand] ${job.sourceGame}: ${inspect.status} ${Object.values(counts).reduce((a, b) => a + (b || 0), 0)} listing`);
      } catch (e) {
        state.results.push({ sourceGame: job.sourceGame, gameUrl: job.gameUrl, capturedAt: new Date().toISOString(), status: 'error', error: String(e && e.message || e) });
        console.error(`[demand] ${job.sourceGame} error:`, e);
      }
      state.completed = state.results.length;
      saveCheckpoint();
      await sleep(500 + Math.random() * 700);
    }
    state.running = false;
    state.current = null;
    console.log(`[demand] selesai. ${state.results.length}/${jobs.length} game. totalResults tersimpan di checkpoint.`);
  }

  window.yasuiDemandScraper = {
    run: runAll,
    state,
    resume(jobs) { return runAll(jobs); },
    stop() { state.stopRequested = true; },
    export() { return JSON.stringify(state.results); },
  };
  console.log('[demand] scraper siap. Panggil: yasuiDemandScraper.run(window.yasuiDemandJobs.jobs)');
})();
