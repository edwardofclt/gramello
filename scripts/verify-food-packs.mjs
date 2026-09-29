import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import sqlite3Init from '@sqlite.org/sqlite-wasm';

export async function verifyFoodPacks(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'pack-set.json'), 'utf8'));
  const compiled = await build({ stdin: { contents: `
    export { openMemoryDatabase } from './lib/browser-local/sqlite';
    export { createPackCatalog } from './mobile/src/catalog/pack-reader';
    export { createCatalogReader } from './mobile/src/catalog/queries';
    export { inspectFoodPack, packSchema } from './mobile/src/catalog/packs';
    export { scaleFood } from './lib/food';
  `, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm',
    // tweetnacl's CommonJS entry initializes its Node PRNG with require('crypto').
    // A data-URL ESM bundle needs an explicit native require for that dependency.
    banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(fileURLToPath(import.meta.url))});` },
  });
  const { openMemoryDatabase, createPackCatalog, createCatalogReader, inspectFoodPack, packSchema, scaleFood } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  const sqlite = await sqlite3Init();
  let opened = 0, highWater = 0;
  const withReader = async (pack, work, inspect = false) => {
    const file = join(directory, new URL(pack.url).pathname.split('/').at(-1));
    const bytes = new Uint8Array(readFileSync(file));
    if (bytes.length !== pack.bytes || createHash('sha256').update(bytes).digest('hex') !== pack.sha256) throw new Error(`Invalid bytes for ${pack.id}`);
    const db = openMemoryDatabase(sqlite, bytes); opened++; highWater = Math.max(highWater, opened);
    try {
      await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
      if (inspect) await inspectFoodPack(db, pack);
      return await work(createCatalogReader(read => read(db)));
    } finally { db.close(); opened--; }
  };
  const started = performance.now();
  for (const pack of manifest.packs) { packSchema.parse(pack); await withReader(pack, async () => {}, true); }
  const inspectionMs = Math.round(performance.now() - started);
  const reader = createPackCatalog(async () => manifest.packs, withReader, { getFood: async () => null, search: async () => [], barcode: async () => null });
  const timing = async work => { const start = performance.now(); const result = await work(); return { result, milliseconds: Math.round(performance.now() - start) }; };
  const barcode = await timing(() => reader.barcode('030771094625'));
  const search = await timing(() => reader.search('alfresco breakfast chicken sausage'));
  const both = await timing(() => reader.search('al fresco apple maple sausage'));
  const selected = barcode.result;
  if (!selected?.id.startsWith('usda-')) throw new Error('USDA barcode precedence failed');
  if (!search.result.some(food => food.id === 'off-0030771094625')) throw new Error('Al Fresco name search failed');
  if (!both.result.some(food => food.id === selected.id) || !both.result.some(food => food.id === 'off-0030771094625')) throw new Error('Source alternatives were not preserved');
  const serving = scaleFood(selected, 1, 'serving');
  if (serving.calories !== 90 || serving.protein !== 8 || serving.carbs !== 4 || serving.fat !== 4) throw new Error('Al Fresco serving nutrition changed; investigate source snapshot');
  const result = { verifiedAt: new Date().toISOString(), engine: 'SQLite WASM on local Node 24 (not a phone/browser performance guarantee)',
    manifestVersion: manifest.version, packCount: manifest.packs.length, foodCount: manifest.packs.reduce((sum, pack) => sum + pack.count, 0),
    bytes: manifest.packs.reduce((sum, pack) => sum + pack.bytes, 0), maximumPackBytes: Math.max(...manifest.packs.map(pack => pack.bytes)),
    maximumOpenExpansionDatabases: highWater, inspectionMs,
    barcode: { milliseconds: barcode.milliseconds, foodId: selected.id, serving },
    search: { query: 'alfresco breakfast chicken sausage', milliseconds: search.milliseconds, count: search.result.length },
    alternatives: { query: 'al fresco apple maple sausage', milliseconds: both.milliseconds, count: both.result.length },
  };
  writeFileSync(join(directory, 'verification-report.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await verifyFoodPacks(process.argv[2]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
