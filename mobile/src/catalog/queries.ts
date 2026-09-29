import { normalizeBarcode } from '../../../lib/barcode';
import type { Food } from '../../../lib/food';
import { preferredFoodServing } from '../../../lib/food-servings';
import { foodSearchLikeTerms } from '../../../lib/food-search-ranking';
import type { FoodSearchOptions } from '../../../lib/food-search';
import { analyzeFoodQuery, foodSearchTerms, rankFoodSearch, stapleFoodIds } from '../../../lib/search';
import type { SqliteConnection } from '../local/database';
import { foodSchema } from '../local/records';
import type { FoodCatalog } from '../local/repository';
import type { CatalogManifest } from './format';
export async function inspectCatalog(db: SqliteConnection, manifest?: Pick<CatalogManifest, 'version' | 'count'>) {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const integrity = await db.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
  const info = await db.getFirstAsync<{ value: string }>("SELECT value FROM catalog_meta WHERE key='version'");
  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM foods');
  const search = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) count FROM food_search');
  if (version?.user_version !== 1 || integrity?.quick_check !== 'ok' || !info?.value || !count?.count || count.count !== search?.count
    || (manifest && (info.value !== manifest.version || count.count !== manifest.count))) throw new Error('Catalog integrity or schema verification failed.');
  // Validate the exact fields consumed by the UI before activation, in bounded pages.
  let lastId = '';
  for (let offset = 0; offset < count.count; offset += 500) {
    const rows = await db.getAllAsync<{ id: string; food: string }>('SELECT id,food FROM foods WHERE id>? ORDER BY id LIMIT 500', lastId);
    for (const row of rows) { const food = foodSchema.parse(JSON.parse(row.food)); if (row.id !== food.id) throw new Error('Catalog food identity mismatch.'); }
    if (!rows.length) throw new Error('Catalog row count changed during inspection.');
    lastId = rows[rows.length - 1].id;
  }
  return { version: info.value, count: count.count };
}
export function createCatalogReader(withDatabase: <T>(work: (db: SqliteConnection) => Promise<T>) => Promise<T>, fallback?: FoodCatalog): FoodCatalog {
  const decode = (row: { food: string } | null): Food | null => row ? preferredFoodServing(foodSchema.parse(JSON.parse(row.food))) : null;
  const searchWindow = async (query: string, options: FoodSearchOptions = {}): Promise<{ foods: Food[]; canExpand: boolean }> => {
    const analyzed = analyzeFoodQuery(query);
    if (!analyzed.tokens.length) return { foods: [], canExpand: false };
    const budget = Math.max(20, Math.min(1000, Math.floor(options.window ?? 100)));
    const readPrimary = () => withDatabase(async db => {
      const current = new Map<string, Food>();
      let saturated = false;
      const add = (rows: { food: string }[], candidateLane = false) => {
        if (candidateLane && rows.length >= budget + 1) saturated = true;
        for (const row of rows) { const food = decode(row)!; current.set(food.id, food); }
      };
      // v1-compatible query-time lanes: never mutate a signed/downloaded catalog.
      // Each category gets its own budget before relevance ranking. An exact/name
      // lane and common-food anchors prevent BM25 prefix matches starving staples.
      const lanes = options.category === 'restaurant' ? ["f.id LIKE 'restaurant-%'"]
        : options.category && options.category !== 'all' ? ["f.id LIKE 'usda-%'", "f.id NOT LIKE 'usda-%' AND f.id NOT LIKE 'restaurant-%'"]
          : ["f.id LIKE 'usda-%'", "f.id LIKE 'restaurant-%'", "f.id NOT LIKE 'usda-%' AND f.id NOT LIKE 'restaurant-%'"];
      for (const variant of analyzed.variants) {
        const tokens = variant.match(/[\p{L}\p{N}]+/gu)?.slice(0, 10) ?? [];
        if (!tokens.length) continue;
        const brandTokens = foodSearchTerms(options.brand ?? '').slice(0, 10);
        const match = [tokens.map(token => `"${token}"*`).join(' AND '), ...brandTokens.map(token => `"${token}"*`)].join(' AND ');
        for (const lane of lanes) {
          add(await db.getAllAsync<{ food: string }>(
            `SELECT f.food FROM food_search s JOIN foods f ON f.id=s.id WHERE food_search MATCH ? AND (${lane}) ORDER BY rank,f.name,f.id LIMIT ?`, match, budget + 1), true);
        }
        const exact = [...tokens.map(token => `"${token}"`), ...brandTokens.map(token => `"${token}"*`)].join(' AND ');
        add(await db.getAllAsync<{ food: string }>(
          `SELECT f.food FROM food_search s JOIN foods f ON f.id=s.id WHERE food_search MATCH ? AND (${lanes.join(' OR ')}) ORDER BY length(f.name),f.name,f.id LIMIT ?`, exact, budget + 1), true);
        const first = tokens[0];
        if (options.category !== 'restaurant') add(await db.getAllAsync<{ food: string }>(
          `SELECT f.food FROM food_search s JOIN foods f ON f.id=s.id WHERE food_search MATCH ? AND f.id LIKE 'usda-%' AND lower(f.name) LIKE ? ORDER BY length(f.name),f.name,f.id LIMIT ?`, match, `${first}%`, budget + 1), true);
      }
      // Retain main's joined-apostrophe fallback for old v1 FTS tokenization.
      // It retrieves candidates only; shared ranking still enforces token boundaries.
      const text = "s.name || ' ' || coalesce(s.brand, '')";
      const joined = `lower(replace(replace(replace(replace(${text}, '''', ''), '’', ''), '‘', ''), 'ʼ', ''))`;
      const terms = foodSearchLikeTerms([query, options.brand].filter(Boolean).join(' '));
      if (terms.length) {
        const where = terms.map(forms => `(${forms.map(() => `${joined} LIKE ? ESCAPE '~'`).join(' OR ')})`).join(' AND ');
        const patterns = terms.flat().map(term => `%${term.replace(/[~%_]/g, value => `~${value}`)}%`);
        add(await db.getAllAsync<{ food: string }>(`SELECT f.food FROM food_search s JOIN foods f ON f.id=s.id
          WHERE (${text}) GLOB '*[''’‘ʼ]*' AND (${lanes.join(' OR ')}) AND ${where} ORDER BY f.name,f.id LIMIT ?`, ...patterns, budget + 1), true);
      }
      const anchors = stapleFoodIds(query);
      if (anchors.length && options.category !== 'restaurant') add(await db.getAllAsync<{ food: string }>(`SELECT food FROM foods WHERE id IN (${anchors.map(() => '?').join(',')})`, ...anchors));
      const fallbackResult = fallback?.searchWindow ? await fallback.searchWindow(query, options) : { foods: await fallback?.search(query, options) ?? [], canExpand: false };
      const bundled = fallbackResult.foods;
      // Even when the installed name changed and no longer matches, the installed
      // record must override a matching older bundled record before final ranking.
      for (let offset = 0; offset < bundled.length; offset += 400) {
        const ids = bundled.slice(offset, offset + 400).map(food => food.id);
        if (ids.length) add(await db.getAllAsync<{ food: string }>(`SELECT food FROM foods WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids));
      }
      return { foods: rankFoodSearch(query, [...current.values(), ...bundled], options).foods, canExpand: budget < 1000 && (saturated || fallbackResult.canExpand) };
    });
    try { return await readPrimary(); }
    catch (error) {
      if (fallback?.searchWindow) return fallback.searchWindow(query, options);
      if (fallback) return { foods: await fallback.search(query, options), canExpand: false };
      throw error;
    }
  };
  return {
    getFood: id => withDatabase(async db => decode(await db.getFirstAsync('SELECT food FROM foods WHERE id=?',id))).then(async food => food ?? await fallback?.getFood(id) ?? null),
    search: async (query, options) => (await searchWindow(query, options)).foods,
    searchWindow,
    barcode: code => withDatabase(async db => {
      const normalized = normalizeBarcode(code);
      if (!normalized) throw new Error('Enter a valid product barcode.');
      return decode(await db.getFirstAsync("SELECT f.food FROM barcodes b JOIN foods f ON f.id=b.food_id WHERE b.code=? ORDER BY CAST(replace(f.id,'usda-','') AS INTEGER) DESC,f.id DESC LIMIT 1", normalized.padStart(14,'0'))) ?? await fallback?.barcode(normalized) ?? null;
    }),
  };
}
