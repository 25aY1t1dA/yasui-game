#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// WooCommerce API config
const WC_URL = process.env.WP_URL || 'https://admin.yasuigame.com';
const WC_KEY = process.env.WC_CONSUMER_KEY || '';
const WC_SECRET = process.env.WC_CONSUMER_SECRET || '';
const AUTH = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64');

// Rate limiting: max 3 requests per second
let requestQueue = [];
let activeRequests = 0;
const MAX_CONCURRENT = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedRequest(options, body = null) {
  while (activeRequests >= MAX_CONCURRENT) {
    await sleep(100);
  }

  activeRequests++;

  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method,
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type': 'application/json',
        'User-Agent': 'YasuiGame-Importer/1.0'
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        activeRequests--;
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', (err) => {
      activeRequests--;
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function wcGet(endpoint) {
  return rateLimitedRequest({ url: `${WC_URL}/wp-json/wc/v3${endpoint}`, method: 'GET' });
}

async function wcPost(endpoint, body) {
  return rateLimitedRequest({ url: `${WC_URL}/wp-json/wc/v3${endpoint}`, method: 'POST' }, body);
}

async function wcBatchCreate(items) {
  return wcPost('/products/categories/batch', { create: items });
}

// Fetch ALL existing categories (paginated)
async function fetchAllExistingCategories() {
  const existingMap = new Map(); // slug -> { id, name, parent }
  let page = 1;
  let hasMore = true;

  console.log('📡 Fetching existing categories...');

  while (hasMore) {
    const res = await wcGet(`/products/categories?per_page=100&page=${page}`);
    if (res.status !== 200) {
      console.error(`❌ Error fetching categories page ${page}: HTTP ${res.status}`, JSON.stringify(res.data).substring(0, 500));
      break;
    }

    const categories = res.data;
    if (!Array.isArray(categories) || categories.length === 0) {
      hasMore = false;
    } else {
      for (const cat of categories) {
        existingMap.set(cat.slug, { id: cat.id, name: cat.name, parent: cat.parent, slug: cat.slug });
      }
      console.log(`  📄 Page ${page}: ${categories.length} categories (total: ${existingMap.size})`);
      page++;
      if (categories.length < 100) hasMore = false;
    }
  }

  console.log(`✅ Found ${existingMap.size} existing categories\n`);
  return existingMap;
}

// Main import function
async function main() {
  const results = {
    startedAt: new Date().toISOString(),
    created: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
    summary: {}
  };

  // Load data
  const importPlan = JSON.parse(fs.readFileSync(path.join(__dirname, 'wc-import-plan.json'), 'utf8'));
  const robloxGamesWithSubs = JSON.parse(fs.readFileSync(path.join(__dirname, 'roblox-games-with-subs.json'), 'utf8'));

  // Build a lookup for roblox games with real sub-categories
  const robloxGamesMap = new Map();
  for (const game of robloxGamesWithSubs) {
    // Map by name for matching with import plan
    robloxGamesMap.set(game.name, game);
  }

  // Step 1: Fetch existing categories
  const existingCategories = await fetchAllExistingCategories();
  const slugToId = new Map(); // slug -> id for all categories (existing + newly created)

  // Copy existing to slugToId
  for (const [slug, info] of existingCategories) {
    slugToId.set(slug, info.id);
  }

  // ============================================================
  // Step 2: Create parent categories (27 non-Roblox games)
  // ============================================================
  console.log('📦 STEP 2: Creating parent categories (non-Roblox games)...');

  const parentCategories = importPlan.parentCategories;
  const parentsToCreate = [];
  const parentIdMap = new Map(); // slug -> id

  for (const parent of parentCategories) {
    if (slugToId.has(parent.slug)) {
      console.log(`  ⏭️  Skipping existing parent: ${parent.name} (${parent.slug}) -> ID ${slugToId.get(parent.slug)}`);
      parentIdMap.set(parent.slug, slugToId.get(parent.slug));
      results.skipped++;
    } else {
      parentsToCreate.push({
        name: parent.name,
        slug: parent.slug,
        description: parent.description || ''
      });
    }
  }

  if (parentsToCreate.length > 0) {
    console.log(`  📝 Creating ${parentsToCreate.length} parent categories...`);
    const batchRes = await wcBatchCreate(parentsToCreate);

    if (batchRes.data && batchRes.data.create) {
      for (const cat of batchRes.data.create) {
        if (cat.id) {
          slugToId.set(cat.slug, cat.id);
          parentIdMap.set(cat.slug, cat.id);
          results.created++;
          console.log(`  ✅ Created parent: ${cat.name} (${cat.slug}) -> ID ${cat.id}`);
        } else if (cat.error) {
          results.errors++;
          results.errorDetails.push({ type: 'parent', slug: cat.slug || 'unknown', error: cat.error });
          console.error(`  ❌ Error creating parent ${cat.slug}: ${JSON.stringify(cat.error)}`);
        }
      }
    } else {
      console.error(`  ❌ Batch create failed:`, JSON.stringify(batchRes.data).substring(0, 500));
      results.errors += parentsToCreate.length;
      results.errorDetails.push({ type: 'parent_batch', error: batchRes.data });
    }
  }

  results.summary.parentCategories = { created: results.created, skipped: results.skipped };
  console.log(`\n✅ Step 2 complete: ${results.created} created, ${results.skipped} skipped\n`);

  // ============================================================
  // Step 3: Create child categories for main games
  // ============================================================
  console.log('📦 STEP 3: Creating child categories for main games...');

  let step3Created = 0;
  let step3Skipped = 0;
  let step3Errors = 0;

  const childrenToCreate = [];

  for (const parent of parentCategories) {
    const parentId = parentIdMap.get(parent.slug);
    if (!parentId) {
      console.error(`  ❌ No parent ID for ${parent.slug}, skipping children`);
      step3Errors += (parent.children || []).length;
      continue;
    }

    for (const child of (parent.children || [])) {
      if (slugToId.has(child.slug)) {
        step3Skipped++;
        continue;
      }
      childrenToCreate.push({
        name: child.name,
        slug: child.slug,
        parent: parentId
      });
    }
  }

  if (childrenToCreate.length > 0) {
    console.log(`  📝 Creating ${childrenToCreate.length} child categories...`);
    const batchRes = await wcBatchCreate(childrenToCreate);

    if (batchRes.data && batchRes.data.create) {
      for (const cat of batchRes.data.create) {
        if (cat.id) {
          slugToId.set(cat.slug, cat.id);
          step3Created++;
          console.log(`  ✅ Created child: ${cat.name} (${cat.slug}) -> ID ${cat.id}`);
        } else if (cat.error) {
          step3Errors++;
          results.errorDetails.push({ type: 'child', slug: cat.slug || 'unknown', error: cat.error });
          console.error(`  ❌ Error creating child ${cat.slug}: ${JSON.stringify(cat.error)}`);
        }
      }
    } else {
      console.error(`  ❌ Batch create children failed:`, JSON.stringify(batchRes.data).substring(0, 500));
      step3Errors += childrenToCreate.length;
      results.errorDetails.push({ type: 'children_batch', error: batchRes.data });
    }
  }

  results.created += step3Created;
  results.skipped += step3Skipped;
  results.errors += step3Errors;
  results.summary.childCategories = { created: step3Created, skipped: step3Skipped, errors: step3Errors };
  console.log(`\n✅ Step 3 complete: ${step3Created} created, ${step3Skipped} skipped, ${step3Errors} errors\n`);

  // ============================================================
  // Step 4: Create Roblox parent + Robux types
  // ============================================================
  console.log('📦 STEP 4: Creating Roblox parent and Robux types...');

  let robloxParentId;
  const robloxParent = importPlan.robloxStructure.parent;

  if (slugToId.has(robloxParent.slug)) {
    robloxParentId = slugToId.get(robloxParent.slug);
    console.log(`  ⏭️  Roblox parent already exists -> ID ${robloxParentId}`);
    results.skipped++;
  } else {
    const createRes = await wcPost('/products/categories', {
      name: robloxParent.name,
      slug: robloxParent.slug,
      description: robloxParent.description || ''
    });

    if (createRes.data && createRes.data.id) {
      robloxParentId = createRes.data.id;
      slugToId.set(robloxParent.slug, robloxParentId);
      results.created++;
      console.log(`  ✅ Created Roblox parent -> ID ${robloxParentId}`);
    } else {
      console.error(`  ❌ Failed to create Roblox parent:`, JSON.stringify(createRes.data).substring(0, 500));
      results.errors++;
      results.errorDetails.push({ type: 'roblox_parent', error: createRes.data });
      // Can't continue without Roblox parent
      writeResults(results);
      return;
    }
  }

  // Create Robux types
  let step4Created = 0;
  let step4Skipped = 0;
  const robuxToCreate = [];

  for (const robux of importPlan.robloxStructure.robuxTypes) {
    if (slugToId.has(robux.slug)) {
      step4Skipped++;
      continue;
    }
    robuxToCreate.push({
      name: robux.name,
      slug: robux.slug,
      parent: robloxParentId
    });
  }

  if (robuxToCreate.length > 0) {
    console.log(`  📝 Creating ${robuxToCreate.length} Robux type categories...`);
    const batchRes = await wcBatchCreate(robuxToCreate);

    if (batchRes.data && batchRes.data.create) {
      for (const cat of batchRes.data.create) {
        if (cat.id) {
          slugToId.set(cat.slug, cat.id);
          step4Created++;
          console.log(`  ✅ Created Robux type: ${cat.name} (${cat.slug}) -> ID ${cat.id}`);
        } else if (cat.error) {
          results.errors++;
          results.errorDetails.push({ type: 'robux', slug: cat.slug || 'unknown', error: cat.error });
          console.error(`  ❌ Error creating robux type ${cat.slug}: ${JSON.stringify(cat.error)}`);
        }
      }
    }
  }

  results.created += step4Created;
  results.skipped += step4Skipped;
  results.summary.robuxTypes = { created: step4Created, skipped: step4Skipped };
  console.log(`\n✅ Step 4 complete: ${step4Created} Robux types created, ${step4Skipped} skipped\n`);

  // ============================================================
  // Step 5: Create Roblox game categories (Level 1 under Roblox)
  // ============================================================
  console.log('📦 STEP 5: Creating Roblox game categories (263 games)...');

  const robloxGames = importPlan.robloxStructure.games;
  let step5Created = 0;
  let step5Skipped = 0;
  let step5Errors = 0;
  const gameSlugToId = new Map(); // game slug -> category ID

  // Split into batches of 100
  const gameBatches = [];
  let currentBatch = [];

  for (const game of robloxGames) {
    if (slugToId.has(game.slug)) {
      step5Skipped++;
      gameSlugToId.set(game.slug, slugToId.get(game.slug));
      continue;
    }
    currentBatch.push({
      name: game.name,
      slug: game.slug,
      parent: robloxParentId
    });

    if (currentBatch.length === 100) {
      gameBatches.push(currentBatch);
      currentBatch = [];
    }
  }
  if (currentBatch.length > 0) {
    gameBatches.push(currentBatch);
  }

  console.log(`  📝 ${robloxGames.length} games total, ${step5Skipped} already exist, ${gameBatches.length} batches to create`);

  for (let i = 0; i < gameBatches.length; i++) {
    const batch = gameBatches[i];
    console.log(`  📤 Batch ${i + 1}/${gameBatches.length}: ${batch.length} games...`);

    const batchRes = await wcBatchCreate(batch);

    if (batchRes.data && batchRes.data.create) {
      for (const cat of batchRes.data.create) {
        if (cat.id) {
          slugToId.set(cat.slug, cat.id);
          gameSlugToId.set(cat.slug, cat.id);
          step5Created++;
        } else if (cat.error) {
          step5Errors++;
          results.errorDetails.push({ type: 'roblox_game', slug: cat.slug || 'unknown', error: cat.error });
        }
      }
      console.log(`  ✅ Batch ${i + 1} done. Total created so far: ${step5Created}`);
    } else {
      console.error(`  ❌ Batch ${i + 1} failed:`, JSON.stringify(batchRes.data).substring(0, 500));
      step5Errors += batch.length;
      results.errorDetails.push({ type: 'roblox_game_batch', batch: i + 1, error: batchRes.data });
    }

    // Rate limiting between batches
    if (i < gameBatches.length - 1) {
      await sleep(400);
    }

    // Log progress every 50
    if ((step5Created + step5Skipped + step5Errors) % 50 === 0) {
      console.log(`  📊 Progress: ${step5Created + step5Skipped + step5Errors}/${robloxGames.length} games processed`);
    }
  }

  results.created += step5Created;
  results.skipped += step5Skipped;
  results.errors += step5Errors;
  results.summary.robloxGames = { created: step5Created, skipped: step5Skipped, errors: step5Errors };
  console.log(`\n✅ Step 5 complete: ${step5Created} created, ${step5Skipped} skipped, ${step5Errors} errors\n`);

  // ============================================================
  // Step 6: Create Roblox game sub-categories (Level 2)
  // ============================================================
  console.log('📦 STEP 6: Creating Roblox game sub-categories...');

  let step6Created = 0;
  let step6Skipped = 0;
  let step6Errors = 0;
  let totalSubs = 0;

  // Build sub-category items from roblox-games-with-subs.json
  // Match by game name to the import plan games
  const subBatches = [];
  let currentSubBatch = [];

  for (const game of robloxGamesWithSubs) {
    // Find matching game in import plan by name
    const importPlanGame = robloxGames.find(g => g.name === game.name);
    if (!importPlanGame) {
      // Try to find by slug - some slugs have -roblox suffix in subs file
      const matchBySlug = robloxGames.find(g => {
        // import plan slug vs subs slug: e.g., "blox-fruits" vs "blox-fruits-roblox"
        return game.slug === g.slug || game.slug === g.slug + '-roblox' || game.slug.replace('-roblox', '') === g.slug;
      });

      if (!matchBySlug) {
        // Skip the special "Roblox" entry in subs file
        if (game.name === 'Roblox') continue;

        console.log(`  ⚠️  No matching game found for: ${game.name} (${game.slug})`);
        continue;
      }
    }

    const gameSlug = importPlanGame ? importPlanGame.slug : robloxGames.find(g =>
      game.slug === g.slug || game.slug === g.slug + '-roblox' || game.slug.replace('-roblox', '') === g.slug
    )?.slug;

    if (!gameSlug) {
      console.log(`  ⚠️  Cannot determine slug for: ${game.name}`);
      continue;
    }

    const gameParentId = gameSlugToId.get(gameSlug) || slugToId.get(gameSlug);
    if (!gameParentId) {
      console.log(`  ⚠️  No parent ID for game: ${game.name} (${gameSlug})`);
      step6Errors++;
      continue;
    }

    for (const sub of game.subCategories) {
      const childSlug = `${gameSlug}-${sub.slug}`;

      if (slugToId.has(childSlug)) {
        step6Skipped++;
        totalSubs++;
        continue;
      }

      currentSubBatch.push({
        name: sub.name,
        slug: childSlug,
        parent: gameParentId
      });
      totalSubs++;

      if (currentSubBatch.length === 100) {
        subBatches.push(currentSubBatch);
        currentSubBatch = [];
      }
    }
  }
  if (currentSubBatch.length > 0) {
    subBatches.push(currentSubBatch);
  }

  console.log(`  📝 ${totalSubs} sub-categories total, ${step6Skipped} already exist, ${subBatches.length} batches to create`);

  for (let i = 0; i < subBatches.length; i++) {
    const batch = subBatches[i];
    console.log(`  📤 Batch ${i + 1}/${subBatches.length}: ${batch.length} sub-categories...`);

    try {
      const batchRes = await wcBatchCreate(batch);

      if (batchRes.data && batchRes.data.create) {
        for (const cat of batchRes.data.create) {
          if (cat.id) {
            slugToId.set(cat.slug, cat.id);
            step6Created++;
          } else if (cat.error) {
            step6Errors++;
            results.errorDetails.push({ type: 'roblox_sub', slug: cat.slug || 'unknown', error: cat.error });
          }
        }
        console.log(`  ✅ Batch ${i + 1} done. Total subs created: ${step6Created}`);
      } else {
        console.error(`  ❌ Sub-batch ${i + 1} failed:`, JSON.stringify(batchRes.data).substring(0, 500));
        step6Errors += batch.length;
        results.errorDetails.push({ type: 'roblox_sub_batch', batch: i + 1, error: JSON.stringify(batchRes.data).substring(0, 500) });
      }
    } catch (err) {
      console.error(`  ❌ Sub-batch ${i + 1} exception:`, err.message);
      step6Errors += batch.length;
      results.errorDetails.push({ type: 'roblox_sub_batch_exception', batch: i + 1, error: err.message });
    }

    // Rate limiting between batches
    if (i < subBatches.length - 1) {
      await sleep(400);
    }

    // Log progress every 50
    const processed = step6Created + step6Skipped + step6Errors;
    if (processed % 50 === 0 || i === subBatches.length - 1) {
      console.log(`  📊 Progress: ${processed}/${totalSubs} sub-categories processed`);
    }
  }

  results.created += step6Created;
  results.skipped += step6Skipped;
  results.errors += step6Errors;
  results.summary.robloxSubCategories = { created: step6Created, skipped: step6Skipped, errors: step6Errors };
  console.log(`\n✅ Step 6 complete: ${step6Created} created, ${step6Skipped} skipped, ${step6Errors} errors\n`);

  // ============================================================
  // Final Summary
  // ============================================================
  results.completedAt = new Date().toISOString();
  results.summary.total = {
    created: results.created,
    skipped: results.skipped,
    errors: results.errors,
    totalProcessed: results.created + results.skipped + results.errors
  };

  writeResults(results);
  printSummary(results);
}

function writeResults(results) {
  const outputPath = path.join(__dirname, 'import-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results written to ${outputPath}`);
}

function printSummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Total Created:  ${results.created}`);
  console.log(`⏭️  Total Skipped:  ${results.skipped} (already existed)`);
  console.log(`❌ Total Errors:   ${results.errors}`);
  console.log(`📦 Total Processed: ${results.created + results.skipped + results.errors}`);
  console.log('');
  console.log('Breakdown:');
  console.log(`  Parent Categories:       ${JSON.stringify(results.summary.parentCategories)}`);
  console.log(`  Child Categories:        ${JSON.stringify(results.summary.childCategories)}`);
  console.log(`  Robux Types:             ${JSON.stringify(results.summary.robuxTypes)}`);
  console.log(`  Roblox Games:            ${JSON.stringify(results.summary.robloxGames)}`);
  console.log(`  Roblox Sub-Categories:   ${JSON.stringify(results.summary.robloxSubCategories)}`);

  if (results.errorDetails.length > 0) {
    console.log(`\n⚠️  ${results.errorDetails.length} errors occurred. Check import-results.json for details.`);
    // Print first 5 errors
    for (let i = 0; i < Math.min(5, results.errorDetails.length); i++) {
      const err = results.errorDetails[i];
      console.log(`  Error ${i + 1}: [${err.type}] ${err.slug || ''} - ${JSON.stringify(err.error).substring(0, 200)}`);
    }
  }
  console.log('='.repeat(60));
}

// Run
main().catch(err => {
  console.error('💀 Fatal error:', err);
  process.exit(1);
});
