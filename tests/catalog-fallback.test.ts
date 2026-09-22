import { expect, it } from 'vitest';
import { testDatabase } from './helpers/local-sqlite';
import { createCatalogReader } from '../mobile/src/catalog/queries';

it('keeps bundled foods available when an installed update has narrower coverage', async () => {
  const bundled = testDatabase('mobile/assets/catalog.sqlite'), installed = testDatabase();
  try {
    installed.raw.exec(`CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT);
      CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand);
      CREATE TABLE barcodes(code TEXT,food_id TEXT);`);
    const fallback = createCatalogReader(work => work(bundled.db));
    const reader = createCatalogReader(work => work(installed.db), fallback);
    await expect(reader.getFood('usda-173944')).resolves.toMatchObject({ name: 'Bananas, raw', calories: 89 });
    expect((await reader.search('banana raw')).some(food => food.id === 'usda-173944')).toBe(true);
    const updated = { ...await fallback.getFood('usda-173944'), calories: 90 };
    installed.raw.prepare('INSERT INTO foods VALUES(?,?,?)').run(updated.id!, updated.name!, JSON.stringify(updated));
    installed.raw.prepare('INSERT INTO food_search VALUES(?,?,?)').run(updated.id!, updated.name!, '');
    await expect(reader.getFood('usda-173944')).resolves.toMatchObject({ calories: 90 });
    expect((await reader.search('banana raw')).filter(food => food.id === 'usda-173944')).toEqual([updated]);
  } finally { installed.raw.close(); bundled.raw.close(); }
});

it('includes bundled restaurants in broad searches when an old installed USDA catalog fills the result limit', async () => {
  const bundled = testDatabase('mobile/assets/catalog.sqlite'), installed = testDatabase();
  try {
    installed.raw.exec(`CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT);
      CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand);
      CREATE TABLE barcodes(code TEXT,food_id TEXT); BEGIN;`);
    const insert = installed.raw.prepare('INSERT INTO foods VALUES(?,?,?)');
    const index = installed.raw.prepare('INSERT INTO food_search VALUES(?,?,?)');
    for (const row of bundled.raw.prepare("SELECT id,name,food FROM foods WHERE id LIKE 'usda-%'").all()) {
      insert.run(row.id, row.name, row.food); index.run(row.id, row.name, '');
    }
    installed.raw.exec('COMMIT');
    const fallback = createCatalogReader(work => work(bundled.db));
    const reader = createCatalogReader(work => work(installed.db), fallback);
    const results = (await reader.search('chicken')).slice(0, 100);
    expect(results.some(food => food.id.startsWith('restaurant-'))).toBe(true);
    expect(results.some(food => food.id.startsWith('usda-'))).toBe(true);
    expect(new Set(results.map(food => food.id)).size).toBe(results.length);
  } finally { installed.raw.close(); bundled.raw.close(); }
});
