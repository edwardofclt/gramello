import { normalizeBarcode } from '../../../lib/barcode';
import { rankFoodSearch } from '../../../lib/search';
import type { FoodSearchOptions } from '../../../lib/food-search';
import type { FoodCatalog } from '../local/repository';
import type { FoodPack } from './packs';

export function createPackCatalog(
  list: () => Promise<FoodPack[]>,
  withReader: <T>(pack: FoodPack, work: (reader: FoodCatalog) => Promise<T>) => Promise<T>,
  core: FoodCatalog,
): FoodCatalog {
  // Search results teach us where an FDC identity lives; barcode partitioning
  // permits O(1) source pack selection without a million-entry manifest index.
  const routes = new Map<string, string>();
  // Storage appends successful activations. Stable sorting of reversed order
  // puts the newest installed generation first within each source.
  const packs = async () => (await list()).reverse().sort((a, b) => Number(a.source === 'off') - Number(b.source === 'off'));
  const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new Error('Operation cancelled.'); };
  const searchWindow = async (query: string, options: FoodSearchOptions = {}) => {
    cancelled(options.signal);
    let result: Awaited<ReturnType<NonNullable<FoodCatalog['searchWindow']>>>;
    try { result = core.searchWindow ? await core.searchWindow(query, options) : { foods: await core.search(query, options), canExpand: false }; }
    catch { cancelled(options.signal); result = { foods: [], canExpand: false, issues: [{ source: 'Offline core catalog', message: 'Core foods are unavailable. Downloaded US products remain searchable.' }] }; }
    let foods = result.foods, canExpand = result.canExpand;
    const issues = [...result.issues ?? []];
    const seen = new Set<string>();
    if (options.category === 'custom' || options.category === 'restaurant' || options.category === 'generic') return result;
    for (const pack of await packs()) {
      cancelled(options.signal);
      try {
        const window = await withReader(pack, reader => reader.searchWindow ? reader.searchWindow(query, options) : reader.search(query, options).then(foods => ({ foods, canExpand: false })));
        for (const food of window.foods) if (!seen.has(food.id)) { routes.set(food.id, pack.id); seen.add(food.id); }
        // Bound retained candidates as well as open database memory.
        const ranked = rankFoodSearch(query, [...foods, ...window.foods], options).foods;
        const cap = Math.max(20, Math.min(1000, options.window ?? 100));
        canExpand ||= ranked.length > cap && cap < 1000;
        foods = ranked.slice(0, cap);
        canExpand ||= window.canExpand;
      } catch (error) {
        cancelled(options.signal);
        const source = pack.source === 'off' ? 'Open Food Facts' : 'USDA branded';
        if (!issues.some(issue => issue.source === source)) issues.push({ source, message: error instanceof Error ? error.message : 'Some downloaded foods are unavailable.' });
      }
    }
    return { ...result, foods: rankFoodSearch(query, foods, options).foods, canExpand, issues };
  };
  return {
    searchWindow, search: async (query, options) => (await searchWindow(query, options)).foods,
    getFood: async id => {
      // FDC identities are global: SR Legacy core IDs and branded IDs are
      // distinct. Ordinary diary foods must not scan the branded dataset.
      try { const food = await core.getFood(id); if (food) return food; } catch { /* Valid expansion packs remain usable without core. */ }
      const installed = await packs(), route = routes.get(id);
      const routed = installed.find(pack => pack.id === route);
      const newest = installed.find(pack => pack.source === routed?.source);
      const preferredRoute = routed?.buckets === newest?.buckets ? route : undefined;
      const offCode = id.startsWith('off-') ? normalizeBarcode(id.slice(4)) : null;
      for (const pack of [...installed].sort((a, b) => Number(b.id === preferredRoute) - Number(a.id === preferredRoute))) {
        if ((id.startsWith('off-') && pack.source !== 'off') || (id.startsWith('usda-') && pack.source !== 'usda-branded') || !/^(off|usda)-\d+$/.test(id)) continue;
        if (offCode && Number(BigInt(offCode) % BigInt(pack.buckets)) !== pack.bucket) continue;
        try {
          const food = await withReader(pack, reader => reader.getFood(id));
          if (food) { routes.set(id, pack.id); return food; }
        } catch { /* Remaining packs and bundled core stay readable. */ }
      }
      return null;
    },
    barcode: async (input, signal) => {
      const code = normalizeBarcode(input);
      if (!code) throw new Error('Enter a valid product barcode.');
      for (const pack of await packs()) {
        cancelled(signal);
        if (Number(BigInt(code) % BigInt(pack.buckets)) !== pack.bucket) continue;
        try {
          const food = await withReader(pack, reader => reader.barcode(code, signal));
          if (food) { routes.set(food.id, pack.id); return food; }
        } catch { cancelled(signal); }
      }
      return core.barcode(code, signal);
    },
  };
}
