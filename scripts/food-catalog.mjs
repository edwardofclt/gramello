import { DatabaseSync } from 'node:sqlite';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildCatalog(foods, file, version) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(version)) throw new Error('Invalid catalog version');
  if (!Array.isArray(foods) || !foods.length) throw new Error('Empty catalog');
  const ids = new Set();
  for (const food of foods) {
    if (!/^usda-\d+$/.test(food.id) || food.source !== 'USDA FoodData Central' || food.sourceUrl !== `https://fdc.nal.usda.gov/food-details/${food.id.slice(5)}/nutrients`) throw new Error('Catalog source is not approved USDA data');
    if (ids.has(food.id)) throw new Error('Duplicate food ID'); ids.add(food.id);
    if (!food.name || food.name.length > 300 || !food.servingLabel || food.servingLabel.length > 200 || food.nutritionBasis !== '100g'
      || !Number.isFinite(food.servingGrams) || food.servingGrams <= 0) throw new Error('Invalid food serving');
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
    meta.run('version',version); meta.run('license','CC0-1.0'); meta.run('source','USDA FoodData Central');
    db.exec("COMMIT; INSERT INTO food_search(food_search) VALUES('optimize'); VACUUM;");
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Catalog integrity check failed');
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, version, url] = process.argv.slice(2);
  buildCatalog(JSON.parse(readFileSync(input,'utf8')), output, version);
  const bytes = readFileSync(output);
  console.log(`Built ${output}: ${bytes.length} bytes`);
  if (url) {
    if (!url.startsWith('https://')) throw new Error('Asset URL must use HTTPS');
    if (!process.env.CATALOG_SIGNING_KEY) throw new Error('CATALOG_SIGNING_KEY PEM is required to sign a release');
    const key = createPrivateKey(process.env.CATALOG_SIGNING_KEY);
    const actualKey = createPublicKey(key).export({ type:'spki', format:'der' }).subarray(-32).toString('hex');
    const config = JSON.parse(readFileSync('mobile/catalog-config.json','utf8'));
    if (actualKey !== config.publicKey) throw new Error('Signing key does not match the public key trusted by the app');
    const payload = JSON.stringify({ schemaVersion:1, version, publishedAt:new Date().toISOString(), url, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'), count:JSON.parse(readFileSync(input,'utf8')).length });
    writeFileSync(`${dirname(output)}/manifest.json`,JSON.stringify({ payload, signature:sign(null,Buffer.from(payload),key).toString('hex') },null,2)+'\n');
  }
}
