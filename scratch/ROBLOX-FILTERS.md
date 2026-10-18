# Roblox filter discovery

## Source

Itemku's public category HTML embeds Next.js Flight chunks in `self.__next_f.push` script tags. Decode their JSON strings, concatenate them, and extract `selectedItemType`. No remote JavaScript evaluation is needed.

- `selectedItemType.item_info_group[]`: groups such as Beast, Natural, Elemental, Voucher.
- `item_info_group[].item_info[]`: named options with source ID, name and slug.
- `selectedItemType.item_info`: retained for flat options.
- Keep `quick_filter_config` and label metadata. Empty item-info arrays only confirm no options in this field, not absence of every possible UI filter.
- Validate `game_slug` and type `slug` before accepting data.
- Source example: https://www.itemku.com/id/g/blox-fruits-roblox/fruit
- Yasui equivalent: `/category/blox-fruits-fruit`.

## Current capture (complete)

- Source inventory: 264 entries / 892 tabs; one entry is the Roblox platform itself.
- Matched: 263 games / 883 tabs.
- Progress resumed on 2026-10-14 and **completed the same day**: all 883 tabs processed — 791 successful payloads, 92 confirmed source_not_found, 0 errors pending. Schema: 704 filters / 27,085 options across 358 tabs with options (`complete: true`).
- Resuming: open an Itemku tab, upload `itemku-filter-browser.js` + `roblox-filter-jobs.json` as before, then call `resumeItemkuFilters(jobs)` — it automatically reloads the checkpoint from `localStorage.yasui_itemku_filter_checkpoint_v2` (survives tab reload/browser restart) and skips all `ok`/`source_not_found` entries. Do NOT reset stopRequested logic; set `window.yasuiScrapeState.stopRequested = true` to pause again.
- Blox Fruits: Fruit 118 options (Beast 26, Natural 62, Elemental 26, Voucher 4); Gamepass 36; Joki 35.
- Owner clarification: Akun is an intentional Yasui category for every Roblox game, even when Itemku has no corresponding tab. Preserve it. A source 404 is a source coverage status, not a reason to remove Yasui's category or invent filter options.

## Files and resuming

- `roblox-filter-jobs.json`: source/Yasui game mapping and target tabs.
- `roblox-filters.json`: raw per-tab payloads, timestamps, source URL, statuses.
- `roblox-filter-report.json`: coverage and unresolved tabs. Regenerate using `node scratch/summarize-roblox-filters.mjs`.
- `roblox-filter-schema.json`: normalized, provenance-preserving schema. Regenerate using `node scratch/normalize-roblox-filters.mjs`. Flight reference strings in flat `item_info` are deliberately ignored; real options must be objects.
- `roblox-filter-mapping-report.json`: read-only validation against live WooCommerce child categories. Regenerate using `node scratch/validate-roblox-filter-mapping.mjs`.
- `roblox-filter-attribute-plan.json`: generated from the schema; game+type scoped attribute plans with Yasui-owned option keys and source IDs as provenance. Not imported yet.
- `itemku-filter-browser.js`: browser-side extractor. `resumeItemkuFilters(jobs, previous)` uses one worker with random 8–20 second spacing. HTTP 429 triggers a 5-minute exponential backoff plus jitter, respecting a longer Retry-After. Requests time out after 60 seconds. Successful entries are skipped on resume; 404 is recorded as `source_not_found`.
- Browser checkpoints are persisted after each response in `localStorage.yasui_itemku_filter_checkpoint_v2`. JSON downloads occur every 25 processed tabs and at completion; transfer these files back into the workspace to update the canonical dataset. `window.yasuiScrapeState` exposes progress; `window.downloadYasuiFilters()` exports the current checkpoint. Keep the collecting tab open without navigating. Stop by setting `window.yasuiScrapeState.stopRequested = true`.
- New captures download small `roblox-filters-part-*.json` delta files every 25 tabs so the browser transfer stays below 5 MiB. Merge them with `node scratch/merge-roblox-filter-parts.mjs scratch/roblox-filters.json <part...>` and regenerate the report/schema. `window.downloadYasuiFilterParts()` can export the entire checkpoint in 100-result parts.
- `filter-collector.mjs`: local helper to regenerate jobs from live WooCommerce and accept results; it does not modify WooCommerce. Browser machines may not share its localhost address, so JSON file transfer may be needed.

## Yasui integration model

These are filter options, not new WooCommerce categories. Use category/game-scoped attributes, e.g. Blox Fruits / Fruit → fruit name and fruit group. Keep source IDs as provenance only; use Yasui-owned stable keys for products. Assign attributes to Yasui products before enabling exact filtering. Name similarity alone cannot reliably distinguish Dragon from Dragon (Permanent).

## Mapping validation

- Live validation found that Anime Vanguards' eight source tabs belong to the populated Yasui game `anime-vanguard` (ID 176), not the duplicate empty category `anime-vanguards` (ID 32). The jobs and captured result mappings were corrected without deleting either live category.
- After that correction, all 883 planned source tabs map to actual Yasui child categories. HTML-encoded names such as `Stand &amp; Spec` are treated as display-equivalent after decoding.

## Facet inspection

- Live Flight inspection of `productListData` shows extra UI facets: `productAttribute` (empty for Blox Fruits), `gameInfo.server`, `rarityTypes`, `defaultFilter`, `defaultSortFilter`. Blox Fruits / Fruit has no server facet of substance and no rarity types, so item groups are its only facet.
- The capture extractor now also stores these facets per tab in the `facets` field (new captures only); the Blox Fruits sample was inspected manually and confirmed.
- Distinct filter names across games: 207. The most repeated are generic (Gamepass, Passes, Gems, Cash); rarity-like names (Legendary, Epic, Mythic, Secret) appear on fish-style tabs as group labels, not as a global rarity attribute.

## Capture status

- Live WooCommerce currently publishes only 15 products (Razer Gold, Garena Shell, Summoners War, misc) and none in any Roblox category, so attribute assignment and exact filtering cannot be enabled yet — consistent with the integration model (assign attributes to products first).

Next: re-discover the 92 source_not_found tabs only if Itemku adds those tabs later (a 404 is a coverage status, not an error), inspect facets captured in the `facets` field for games that have them, assign normalized attributes to real Yasui products once they exist, and only then enable the filter UI/query. Category mapping validation and the normalized schema are complete: `roblox-filter-schema.json` is a full production-grade filter catalog of Itemku's public Roblox data, pending product attribute assignment.
