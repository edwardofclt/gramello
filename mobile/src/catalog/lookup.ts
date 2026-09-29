import { normalizeBarcode } from '../../../lib/barcode';
import { lookupBarcode } from '../../../lib/barcode-food';
import { searchOpenFoodFactsPage } from '../../../lib/food-providers';
import { rankFoodSearch } from '../../../lib/search';
import { createProviderCache } from '../../../lib/search/provider-cache';
import type { Food } from '../../../lib/food';
import { FoodProviderError, foodSearchIssue } from '../../../lib/food-search';
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
  type SearchWindow = Awaited<ReturnType<NonNullable<FoodCatalog['searchWindow']>>>;
  const searches = createProviderCache<SearchWindow>();
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
  async function offlineBarcode(code: string) {
    const installed = await catalog.barcode(code);
    // Preserve refreshed OFF cache values while giving USDA branded the first
    // choice when different sources describe the same physical barcode.
    if (installed?.id.startsWith('usda-')) return installed;
    return await cached.barcode(code) ?? installed;
  }
  const lookup: FoodCatalog = {
    getFood: async id => await cached.getFood(id) ?? await catalog.getFood(id),
    search: async (query, options) => (await lookup.searchWindow!(query, options)).foods,
    searchWindow: async (query, options) => {
      checkCancelled(options?.signal);
      const code = normalizeBarcode(query);
      if (code) {
        const food = options?.online ? await lookup.barcode(code, options.signal)
          : await offlineBarcode(code);
        return { foods: food ? [food] : [], canExpand: false };
      }
      const localWindows: SearchWindow[] = await Promise.all([cached, catalog].map(async source => source.searchWindow
        ? source.searchWindow(query, options)
        : { foods: await source.search(query, options), canExpand: false }));
      const local = merge(...localWindows.map(result => result.foods));
      const canExpand = localWindows.some(result => result.canExpand);
      const issues = localWindows.flatMap(result => result.issues ?? []);
      const sourceStatus = localWindows.flatMap(result => result.sourceStatus ?? []);
      const localResult = { foods: rankFoodSearch(query, local, options).foods, canExpand, issues };
      if (!options?.online || options.category === 'custom' || options.category === 'restaurant') return { ...localResult, sourceStatus: [...sourceStatus, { source: 'Open Food Facts', state: 'not-requested', ...(options?.online ? { message: 'This category uses the saved catalog. Online providers do not add restaurant menus or custom foods.' } : {}) }] };
      const size = Math.min(100, options.window ?? 100);
      try {
        const found = options.cursor !== undefined ? searches.peek('off', `${size}:${query}`) : await searches.get('off', `${size}:${query}`, async signal => {
          reserve('search');
          const page = await searchOpenFoodFactsPage(query, signal, size);
          const foods = page.foods.flatMap(food => {
            const parsed = foodSchema.safeParse(food);
            return parsed.success ? [parsed.data] : [];
          });
          return { foods, canExpand: page.hasMore && size < 100, sourceStatus: [{ source: 'Open Food Facts', state: 'ready', ...(page.hasMore && size >= 100 ? { message: 'Online search shows up to 100 matches from this provider. Use a more specific name to narrow the results.' } : {}) }], issues: page.rejectedCount ? [{ source: 'Open Food Facts', message: `${page.rejectedCount} online matches had incomplete nutrition and were omitted.` }] : [] };
        }, options.signal);
        checkCancelled(options.signal);
        if (!found) return { ...localResult, sourceStatus: [...sourceStatus, { source: 'Open Food Facts', state: 'not-requested' }] };
        // Persist per caller while its snapshot connection is still active. Query
        // cache hits must repeat this write after an earlier durable commit failed.
        await save(found.foods);
        return { foods: rankFoodSearch(query, merge(found.foods, local), options).foods, canExpand: canExpand || found.canExpand, issues: [...issues, ...(found.issues ?? [])], sourceStatus: [...sourceStatus, ...(found.sourceStatus ?? [])] };
      } catch (error) {
        if (options.signal?.aborted) throw error;
        const issue = foodSearchIssue('Open Food Facts', error);
        return { ...localResult, issues: [...issues, issue], sourceStatus: [...sourceStatus, { source: issue.source, state: 'unavailable', message: issue.message }] };
      }
    },
    barcode: async (input, signal) => {
      checkCancelled(signal);
      const code = normalizeBarcode(input);
      if (!code) throw new Error('Enter an 8, 12, 13, or 14 digit product barcode.');
      const local = await offlineBarcode(code);
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
