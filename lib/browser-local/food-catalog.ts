import type { FoodCatalog } from '../../mobile/src/local/repository';

type Window = Awaited<ReturnType<NonNullable<FoodCatalog['searchWindow']>>>;
type Queue = <T>(work: () => Promise<T>) => Promise<T>;

// Browser wrappers must preserve the shared native search contract. In particular,
// a search window carries source failures and upstream continuation information.
export function createBrowserCatalogSource(resolve: () => Promise<FoodCatalog>, queue: Queue, onFailure: (error: unknown) => void): FoodCatalog {
  const searchWindow: NonNullable<FoodCatalog['searchWindow']> = (query, options) => queue(async () => {
    try {
      const catalog = await resolve();
      return catalog.searchWindow ? await catalog.searchWindow(query, options)
        : { foods: await catalog.search(query, options), canExpand: false };
    } catch (error) {
      if (options?.signal?.aborted) throw error;
      onFailure(error);
      const issue = { source: 'Offline catalog', message: 'Downloaded foods are unavailable. Saved foods remain available; try updating the food catalog.' };
      return { foods: [], canExpand: false, issues: [issue], sourceStatus: [{ source: issue.source, state: 'unavailable', message: issue.message }] } satisfies Window;
    }
  });
  return {
    getFood: id => queue(async () => {
      try { return await (await resolve()).getFood(id); }
      catch (error) { onFailure(error); return null; }
    }),
    search: async (query, options) => (await searchWindow(query, options)).foods,
    searchWindow,
    barcode: (code, signal) => queue(async () => {
      try { return await (await resolve()).barcode(code, signal); }
      catch (error) { if (signal?.aborted) throw error; onFailure(error); return null; }
    }),
  };
}

export function createBrowserFoodCatalog(withCache: <T>(write: boolean, work: (catalog: FoodCatalog) => Promise<T>) => Promise<T>): FoodCatalog {
  const searchWindow: NonNullable<FoodCatalog['searchWindow']> = (query, options) => withCache(Boolean(options?.online), async catalog =>
    catalog.searchWindow ? catalog.searchWindow(query, options) : { foods: await catalog.search(query, options), canExpand: false });
  return {
    getFood: id => withCache(false, catalog => catalog.getFood(id)),
    search: async (query, options) => (await searchWindow(query, options)).foods,
    searchWindow,
    barcode: (code, signal) => withCache(true, catalog => catalog.barcode(code, signal)),
  };
}
