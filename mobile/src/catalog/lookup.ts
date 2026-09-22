import { normalizeBarcode } from '../../../lib/barcode';
import { lookupBarcode } from '../../../lib/barcode-food';
import { searchOpenFoodFacts } from '../../../lib/food-providers';
import type { Food } from '../../../lib/food';
import { FoodProviderError } from '../../../lib/food-search';
import type { FoodCatalog } from '../local/repository';
import { serialized, transaction, type SqliteConnection } from '../local/database';
import { foodSchema } from '../local/records';
import { createCatalogReader } from './queries';

function checkCancelled(signal?: AbortSignal) {
  // React Native's AbortSignal has no throwIfAborted instance method.
  if (signal?.aborted) throw new Error('Operation cancelled.');
}

// Provider results live separately from both the downloadable catalog and diary.
// Catalog replacements and personal-data imports must not erase this cache.
export async function createFoodLookup(catalog: FoodCatalog, cache: SqliteConnection): Promise<FoodCatalog> {
  await serialized(cache, () => cache.execAsync(`
    CREATE TABLE IF NOT EXISTS foods(id TEXT PRIMARY KEY,name TEXT NOT NULL,food TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS food_search USING fts5(id UNINDEXED,name,brand, tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE IF NOT EXISTS barcodes(code TEXT NOT NULL,food_id TEXT NOT NULL,PRIMARY KEY(code,food_id));
  `));
  const cached = createCatalogReader(work => serialized(cache, () => work(cache)));
  const requests = { barcode: [] as number[], search: [] as number[] };
  function reserve(kind: keyof typeof requests) {
    const now = Date.now(), times = requests[kind];
    while (times.length && times[0] <= now - 60_000) times.shift();
    if (times.length >= (kind === 'barcode' ? 15 : 10)) throw new FoodProviderError('Too many online lookups. Try again in a minute; downloaded foods are still available.', 429);
    times.push(now);
  }
  const save = (foods: Food[], requestedCode?: string) => serialized(cache, () => transaction(cache, async () => {
    for (const food of foods) {
      await cache.runAsync('INSERT INTO foods VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,food=excluded.food', food.id, food.name, JSON.stringify(food));
      await cache.runAsync('DELETE FROM food_search WHERE id=?', food.id);
      await cache.runAsync('INSERT INTO food_search(id,name,brand) VALUES(?,?,?)', food.id, food.name, food.brand ?? '');
      const code = normalizeBarcode(food.id.replace(/^off-/, ''));
      for (const barcode of new Set([code, requestedCode].filter((value): value is string => !!value))) {
        await cache.runAsync('INSERT OR IGNORE INTO barcodes VALUES(?,?)', barcode.padStart(14, '0'), food.id);
      }
    }
  }));
  const merge = (...groups: Food[][]) => {
    const foods = new Map<string, Food>();
    for (const food of groups.flat()) if (!foods.has(food.id)) foods.set(food.id, food);
    return [...foods.values()];
  };
  const lookup: FoodCatalog = {
    getFood: async id => await catalog.getFood(id) ?? await cached.getFood(id),
    search: async (query, options) => {
      checkCancelled(options?.signal);
      const code = normalizeBarcode(query);
      if (code) {
        const food = options?.online ? await lookup.barcode(code, options.signal)
          : await catalog.barcode(code) ?? await cached.barcode(code);
        return food ? [food] : [];
      }
      const local = merge(await cached.search(query), await catalog.search(query));
      if (!options?.online) return local;
      reserve('search');
      const timeout = AbortSignal.timeout(10_000);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      const found = (await searchOpenFoodFacts(query, signal)).flatMap(food => {
        const parsed = foodSchema.safeParse(food);
        return parsed.success ? [parsed.data] : [];
      });
      checkCancelled(signal);
      await save(found);
      // Keep newly found products visible even for broad queries with 100 local matches.
      return merge(found, local);
    },
    barcode: async (input, signal) => {
      checkCancelled(signal);
      const code = normalizeBarcode(input);
      if (!code) throw new Error('Enter an 8, 12, 13, or 14 digit product barcode.');
      const local = await catalog.barcode(code) ?? await cached.barcode(code);
      checkCancelled(signal);
      if (local) return local;
      reserve('barcode');
      const result = await lookupBarcode(code, signal);
      checkCancelled(signal);
      if (!('food' in result)) {
        if (result.status === 404) return null;
        throw new Error(result.error);
      }
      const food = foodSchema.parse(result.food);
      const returnedCode = normalizeBarcode(food.id.replace(/^off-/, ''));
      if (!returnedCode || returnedCode.padStart(14, '0') !== code.padStart(14, '0')) throw new Error('The food provider returned a different barcode. Search by name or try again.');
      await save([food], code);
      return food;
    },
  };
  return lookup;
}
