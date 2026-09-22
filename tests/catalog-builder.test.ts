import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildCatalog } from '../scripts/food-catalog.mjs';
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
      await expect(inspectCatalog(db)).resolves.toEqual({ version:'usda-sr-2018-v1',count:7793 });
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
  it('refuses missing nutrients, duplicate IDs and sources without approved redistribution', () => {
    expect(() => buildCatalog([{ ...food, protein: null }],path(),'test')).toThrow();
    expect(() => buildCatalog([food,food],path(),'test')).toThrow();
    expect(() => buildCatalog([{ ...food, source:'Nutritionix' }],path(),'test')).toThrow();
  });
});
