import { normalizeBarcode } from '../../../lib/barcode';
import type { Food } from '../../../lib/food';
import type { SqliteConnection } from '../local/database';
import { foodSchema } from '../local/records';
import type { FoodCatalog } from '../local/repository';
import type { CatalogManifest } from './format';
export async function inspectCatalog(db: SqliteConnection, manifest?: CatalogManifest) {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const integrity = await db.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
  const info = await db.getFirstAsync<{ value: string }>("SELECT value FROM catalog_meta WHERE key='version'");
  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM foods');
  const search = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM food_search');
  if (version?.user_version !== 1 || integrity?.quick_check !== 'ok' || !info?.value || !count?.count || count.count !== search?.count
    || (manifest && (info.value !== manifest.version || count.count !== manifest.count))) throw new Error('Catalog integrity or schema verification failed.');
  // Validate the exact fields consumed by the UI before activation, in bounded pages.
  for (let offset = 0; offset < count.count; offset += 500) {
    const rows = await db.getAllAsync<{ id: string; food: string }>('SELECT id,food FROM foods ORDER BY id LIMIT 500 OFFSET ?', offset);
    for (const row of rows) { const food = foodSchema.parse(JSON.parse(row.food)); if (row.id !== food.id) throw new Error('Catalog food identity mismatch.'); }
  }
  return { version: info.value, count: count.count };
}
export function createCatalogReader(withDatabase: <T>(work: (db: SqliteConnection) => Promise<T>) => Promise<T>): FoodCatalog {
  const decode = (row: { food: string } | null): Food | null => row ? foodSchema.parse(JSON.parse(row.food)) : null;
  return {
    getFood: id => withDatabase(async db => decode(await db.getFirstAsync('SELECT food FROM foods WHERE id=?',id))),
    search: query => withDatabase(async db => {
      const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0,10) ?? [];
      if (!tokens.length) return [];
      const match = tokens.map(t => `"${t}"*`).join(' AND ');
      const rows = await db.getAllAsync<{ food: string }>('SELECT f.food FROM food_search s JOIN foods f ON f.id=s.id WHERE food_search MATCH ? ORDER BY rank,f.name LIMIT 101',match);
      return rows.map(row => decode(row)!);
    }),
    barcode: code => withDatabase(async db => {
      const normalized = normalizeBarcode(code);
      if (!normalized) throw new Error('Enter a valid product barcode.');
      return decode(await db.getFirstAsync('SELECT f.food FROM barcodes b JOIN foods f ON f.id=b.food_id WHERE b.code=? ORDER BY f.id DESC LIMIT 1', normalized.padStart(14,'0')));
    }),
  };
}
