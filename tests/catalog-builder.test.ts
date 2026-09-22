import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildCatalog, loadOfflineFoods } from '../scripts/food-catalog.mjs';
import { createCatalogReader, inspectCatalog } from '../mobile/src/catalog/queries';
import { testDatabase } from './helpers/local-sqlite';
const dirs: string[] = [];
const food = { id: 'usda-123', name: 'Banana, raw', source: 'USDA FoodData Central', sourceUrl: 'https://fdc.nal.usda.gov/food-details/123/nutrients', sourceKind: 'database', verified: true, nutritionBasis: '100g', servingGrams: 100, servingLabel: '100 g', calories: 89, protein: 1.09, carbs: 22.84, fat: .33, barcodes: ['0012345678905'] };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir,{ recursive:true, force:true }); });
function path() { const dir = mkdtempSync(join(tmpdir(),'gramello-catalog-')); dirs.push(dir); return join(dir,'foods.sqlite'); }
describe('releasable food catalogs', () => {
  it('inspects the bundled starter using the same schema validation as native startup', async () => {
    const { db, raw } = testDatabase('mobile/assets/catalog.sqlite');
    try {
      await expect(inspectCatalog(db)).resolves.toEqual({ version:'offline-2026-09-v1',count:50322 });
      const reader = createCatalogReader(work => work(db));
      const result = await reader.search('banana raw');
      expect(result.some(item => item.name.toLowerCase().includes('bananas, raw'))).toBe(true);
      await expect(reader.search('" OR * --')).resolves.toEqual(await reader.search('OR'));
      await expect(reader.search('" * --')).resolves.toEqual([]);
      await expect(reader.getFood("'; DROP TABLE foods; --")).resolves.toBeNull();
      await expect(reader.barcode('012345678905')).resolves.toBeNull();
    } finally { raw.close(); }
  });
  it('looks up equivalent barcode formats and rejects corrupt or incompatible catalogs', async () => {
    const file = path(); buildCatalog([food],file,'test-1');
    const { db, raw } = testDatabase(file);
    try {
      const reader = createCatalogReader(work => work(db));
      await expect(reader.barcode('012345678905')).resolves.toMatchObject({ id:food.id });
      await expect(reader.barcode('0012345678905')).resolves.toMatchObject({ id:food.id });
      await expect(reader.barcode('invalid')).rejects.toThrow();
      raw.exec('PRAGMA user_version=2');
      await expect(inspectCatalog(db)).rejects.toThrow('schema');
      raw.exec('PRAGMA user_version=1');
      raw.prepare('UPDATE foods SET food=?').run(JSON.stringify({ ...food, calories:null }));
      await expect(inspectCatalog(db)).rejects.toThrow();
    } finally { raw.close(); }
  });
  it('builds a real indexed database with provenance and leading-zero barcodes', () => {
    const file = path(); buildCatalog([food], file, 'test-1');
    const db = new DatabaseSync(file, { readOnly:true });
    try {
      expect(db.prepare("SELECT name FROM foods WHERE id IN (SELECT id FROM food_search WHERE food_search MATCH 'banana*')").get()).toMatchObject({ name:'Banana, raw' });
      expect(db.prepare('SELECT food_id FROM barcodes WHERE code=?').get('00012345678905')).toMatchObject({ food_id:'usda-123' });
      expect(db.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check:'ok' });
    } finally { db.close(); }
  });
  it('preserves every imported restaurant food in the bundled offline catalog', () => {
    const manifest = JSON.parse(readFileSync('docs/restaurant-import/import-summary.json','utf8'));
    const db = new DatabaseSync('mobile/assets/catalog.sqlite', { readOnly:true });
    try {
      expect(manifest.foodCount).toBe(42529);
      expect(db.prepare('SELECT COUNT(*) count FROM foods').get()).toMatchObject({ count: 50322 });
      for (const entry of manifest.imported) {
        const catalog = JSON.parse(readFileSync(join('data/restaurant-foods',entry.file),'utf8'));
        const slug = entry.file.slice(0,-5);
        expect(catalog.foods).toHaveLength(entry.foodCount);
        const source = catalog.source || (catalog.sourceKind === 'database' ? 'Nutrition database' : 'Official restaurant nutrition');
        for (const original of catalog.foods) {
          const id = `restaurant-${slug}-${original.id}`;
          const row = db.prepare('SELECT food FROM foods WHERE id=?').get(id) as { food: string } | undefined;
          expect(row, id).toBeDefined();
          const stored = JSON.parse(row!.food);
          expect(stored).toMatchObject({ id, name: original.name, brand: catalog.chain, source,
            sourceKind: catalog.sourceKind || 'restaurant', sourceUrl: original.sourceUrl || catalog.sourceUrl,
            verified: true, nutritionBasis: 'serving', servingGrams: original.servingGrams ?? null,
            servingLabel: original.servingLabel, calories: original.calories, protein: original.protein,
            carbs: original.carbs, fat: original.fat, checkedAt: catalog.retrievedAt });
        }
      }
      const meta = Object.fromEntries((db.prepare('SELECT key,value FROM catalog_meta').all() as {key:string;value:string}[]).map(row => [row.key,row.value]));
      expect(meta.license).not.toBe('CC0-1.0');
      expect(meta.source).toContain('Nutritionix');
      expect(meta.source).toContain('USDA FoodData Central');
    } finally { db.close(); }
  });
  it('loads only the imported restaurant catalogs with their original per-serving nutrition', () => {
    const foods = loadOfflineFoods();
    expect(foods).toHaveLength(50322);
    expect(foods.find((food: { id:string }) => food.id === 'restaurant-andys-frozen-custard-nutritionix-210879')).toMatchObject({
      name:'Chocolate Frozen Custard', brand:"Andy's Frozen Custard", source:'Nutritionix', sourceKind:'database',
      nutritionBasis:'serving', servingGrams:null, servingLabel:'1 listed serving (Frozen Custard; size in item name)',
      calories:210, protein:5, carbs:23, fat:10,
    });
  });
  it('accepts documented restaurant sources without describing the mixed catalog as CC0', () => {
    const restaurant = { ...food, id:'restaurant-example-1', brand:'Example', source:'Official restaurant nutrition',
      sourceUrl:'https://example.com/menu', sourceKind:'restaurant', nutritionBasis:'serving', servingGrams:null,
      servingLabel:'1 bowl', checkedAt:'2026-09-20' };
    const file = path(); buildCatalog([food,restaurant],file,'test-mixed');
    const db = new DatabaseSync(file, { readOnly:true });
    try {
      const row = db.prepare('SELECT food FROM foods WHERE id=?').get(restaurant.id) as { food:string };
      expect(JSON.parse(row.food)).toMatchObject({ id:restaurant.id, source:restaurant.source,
        sourceKind:'restaurant', nutritionBasis:'serving', servingGrams:null, servingLabel:'1 bowl' });
      expect(db.prepare("SELECT value FROM catalog_meta WHERE key='license'").get()).not.toMatchObject({ value:'CC0-1.0' });
    } finally { db.close(); }
    const restaurantFile = path(); buildCatalog([restaurant],restaurantFile,'test-restaurant');
    const restaurantDb = new DatabaseSync(restaurantFile, { readOnly:true });
    try {
      const license = restaurantDb.prepare("SELECT value FROM catalog_meta WHERE key='license'").get() as { value:string };
      expect(license.value).not.toContain('USDA');
    } finally { restaurantDb.close(); }
  });
  it('refuses missing nutrients, duplicate IDs and source mismatches', () => {
    expect(() => buildCatalog([{ ...food, protein: null }],path(),'test')).toThrow();
    expect(() => buildCatalog([food,food],path(),'test')).toThrow();
    expect(() => buildCatalog([{ ...food, source:'Nutritionix' }],path(),'test')).toThrow();
    expect(() => buildCatalog([{ ...food, id:'restaurant-example-1', brand:'Example', source:'Nutritionix',
      sourceKind:'database', sourceUrl:'https://example.com/menu', nutritionBasis:'serving',
      servingGrams:null }],path(),'test')).toThrow();
  });
});
