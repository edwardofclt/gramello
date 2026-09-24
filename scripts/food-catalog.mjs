import { DatabaseSync } from 'node:sqlite';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from './restaurant-catalog.mjs';

export function loadOfflineFoods(root = process.cwd()) {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const servings = read('data/food-catalog/usda-serving-defaults.json').foods;
  const foods = read('data/food-catalog/usda-core.json').map(food => ({ ...food, ...servings[food.id] }));
  const summary = read('docs/restaurant-import/import-summary.json');
  if (!Array.isArray(summary.imported) || summary.catalogCount !== summary.imported.length) throw new Error('Invalid restaurant import summary');
  let restaurantCount = 0;
  for (const entry of summary.imported) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(entry.file)) throw new Error('Invalid restaurant catalog filename');
    const catalog = validateCatalog(read(`data/restaurant-foods/${entry.file}`));
    if (catalog.chain !== entry.chain || catalog.foods.length !== entry.foodCount) throw new Error(`Restaurant import summary mismatch: ${entry.file}`);
    const slug = entry.file.slice(0, -5);
    const source = catalog.source || (catalog.sourceKind === 'database' ? 'Nutrition database' : 'Official restaurant nutrition');
    for (const item of catalog.foods) {
      foods.push({ id:`restaurant-${slug}-${item.id}`, name:item.name, brand:catalog.chain,
        source, sourceKind:catalog.sourceKind || 'restaurant', sourceUrl:item.sourceUrl || catalog.sourceUrl,
        verified:true, nutritionBasis:'serving', servingGrams:item.servingGrams ?? null,
        servingLabel:item.servingLabel, calories:item.calories, protein:item.protein, carbs:item.carbs,
        fat:item.fat, checkedAt:catalog.retrievedAt });
    }
    restaurantCount += catalog.foods.length;
  }
  if (restaurantCount !== summary.foodCount) throw new Error('Restaurant import food count mismatch');
  return foods;
}

export function buildCatalog(foods, file, version) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(version)) throw new Error('Invalid catalog version');
  if (!Array.isArray(foods) || !foods.length) throw new Error('Empty catalog');
  const ids = new Set();
  for (const food of foods) {
    let sourceHost;
    try {
      const url = new URL(food.sourceUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) sourceHost = url.hostname.toLowerCase();
    } catch { /* Invalid source URLs fail validation below. */ }
    const usda = /^usda-\d+$/.test(food.id) && food.source === 'USDA FoodData Central'
      && food.sourceUrl === `https://fdc.nal.usda.gov/food-details/${food.id.slice(5)}/nutrients`
      && food.sourceKind === 'database' && food.nutritionBasis === '100g';
    const restaurant = /^restaurant-[a-z0-9]+(?:-[a-z0-9]+)*-.+$/.test(food.id)
      && ((food.source === 'Nutritionix' && food.sourceKind === 'database' && sourceHost === 'www.nutritionix.com')
        || (food.source === 'Official restaurant nutrition' && food.sourceKind === 'restaurant'))
      && sourceHost && food.sourceUrl.length <= 2000
      && typeof food.brand === 'string' && food.brand.length > 0 && food.nutritionBasis === 'serving';
    if (!usda && !restaurant) throw new Error('Catalog source is not approved USDA or restaurant data');
    if (ids.has(food.id)) throw new Error('Duplicate food ID'); ids.add(food.id);
    if (!food.name || food.name.length > 300 || !food.servingLabel || food.servingLabel.length > 200
      || (usda && (!Number.isFinite(food.servingGrams) || food.servingGrams <= 0))
      || (restaurant && food.servingGrams !== null && (!Number.isFinite(food.servingGrams) || food.servingGrams <= 0))) throw new Error('Invalid food serving');
    if (['calories','protein','carbs','fat'].some(key => typeof food[key] !== 'number' || !Number.isFinite(food[key]) || food[key] < 0)) throw new Error('Missing or invalid nutrients');
    if ((food.barcodes ?? []).some(code => !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code))) throw new Error('Invalid barcode');
  }
  if (existsSync(file)) throw new Error('Output already exists; choose a fresh path.');
  mkdirSync(dirname(file), { recursive:true });
  const db = new DatabaseSync(file);
  try {
    db.exec(`PRAGMA journal_mode=DELETE; PRAGMA user_version=1;
      CREATE TABLE catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT NOT NULL,food TEXT NOT NULL CHECK(json_valid(food)));
      CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand, tokenize='unicode61 remove_diacritics 2');
      CREATE TABLE barcodes(code TEXT NOT NULL,food_id TEXT NOT NULL,PRIMARY KEY(code,food_id)); BEGIN;`);
    const insert = db.prepare('INSERT INTO foods VALUES(?,?,?)'), search = db.prepare('INSERT INTO food_search VALUES(?,?,?)'), barcode = db.prepare('INSERT OR IGNORE INTO barcodes VALUES(?,?)');
    for (const { barcodes = [], ...food } of foods) {
      insert.run(food.id,food.name,JSON.stringify(food)); search.run(food.id,food.name,food.brand ?? '');
      for (const code of barcodes) barcode.run(code.padStart(14,'0'),food.id);
    }
    const meta = db.prepare('INSERT INTO catalog_meta VALUES(?,?)');
    const sources = [...new Set(foods.map(food => food.source))].sort();
    meta.run('version',version);
    const hasUsda = sources.includes('USDA FoodData Central');
    meta.run('license',sources.length === 1 && hasUsda ? 'CC0-1.0'
      : hasUsda ? 'Mixed; USDA CC0-1.0; restaurant sources retain their own terms'
        : 'Source-specific restaurant nutrition; see source URLs');
    meta.run('source',sources.join('; '));
    db.exec("COMMIT; INSERT INTO food_search(food_search) VALUES('optimize'); VACUUM;");
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Catalog integrity check failed');
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, version, url] = process.argv.slice(2);
  const foods = input === 'offline' ? loadOfflineFoods() : JSON.parse(readFileSync(input,'utf8'));
  buildCatalog(foods, output, version);
  const bytes = readFileSync(output);
  console.log(`Built ${output}: ${bytes.length} bytes`);
  if (url) {
    if (!url.startsWith('https://')) throw new Error('Asset URL must use HTTPS');
    if (!process.env.CATALOG_SIGNING_KEY) throw new Error('CATALOG_SIGNING_KEY PEM is required to sign a release');
    const key = createPrivateKey(process.env.CATALOG_SIGNING_KEY);
    const actualKey = createPublicKey(key).export({ type:'spki', format:'der' }).subarray(-32).toString('hex');
    const config = JSON.parse(readFileSync('mobile/catalog-config.json','utf8'));
    if (actualKey !== config.publicKey) throw new Error('Signing key does not match the public key trusted by the app');
    const payload = JSON.stringify({ schemaVersion:1, version, publishedAt:new Date().toISOString(), url, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'), count:foods.length });
    writeFileSync(`${dirname(output)}/manifest.json`,JSON.stringify({ payload, signature:sign(null,Buffer.from(payload),key).toString('hex') },null,2)+'\n');
  }
}
