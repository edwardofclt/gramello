import { env } from 'cloudflare:workers';
import { withBrowserDiary } from '@/lib/browser-diary';
import { cacheDatabaseFoods, findFoodsWindow, reserveHostedOffSearch } from '@/db/foods';
import { searchOpenFoodFactsPage, searchUsdaPage, type ProviderFoodPage } from '@/lib/food-providers';
import { foodSearchIssue, FoodProviderError, type FoodSearchIssue, type FoodSearchResult } from '@/lib/food-search';
import { rankFoodSearch } from '@/lib/search';
import { paginateFoodSearch, parseFoodSearchOptions } from '@/lib/search/pagination';
import { createProviderCache } from '@/lib/search/provider-cache';

const caches = new WeakMap<object, ReturnType<typeof createProviderCache<ProviderFoodPage>>>();
function providerCache() {
  const key = env.DB ?? env;
  let cache = caches.get(key);
  if (!cache) { cache = createProviderCache<ProviderFoodPage>(); caches.set(key, cache); }
  return cache;
}
export async function GET(request: Request) {
  return withBrowserDiary(request, async () => {
    const params = new URL(request.url).searchParams, query = params.get('q')?.trim() ?? '';
    if (query.length < 2) return Response.json({ foods: [], partial: false });
    if (query.length > 200) return Response.json({ error: 'Search with a shorter food or restaurant name.' }, { status: 400 });
    const options = parseFoodSearchOptions(params);
    try {
      const localWindow = await findFoodsWindow(query, options), local = localWindow.foods, fetched = [];
      const issues: FoodSearchIssue[] = [], sourceStatus: NonNullable<FoodSearchResult['sourceStatus']> = [];
      const window = options.window ?? 100;
      let canExpand = localWindow.canExpand;
      if (options.online !== false && options.category !== 'custom' && options.category !== 'restaurant') {
        const cache = providerCache();
        const providers = [
          { source: 'USDA FoodData Central', unavailable: !env.USDA_API_KEY?.trim() ? 'Online USDA search is not available on this server. Available foods can still be used.' : undefined,
            work: (signal: AbortSignal) => searchUsdaPage(query, signal, env.USDA_API_KEY, window), max: 200 },
          { source: 'Open Food Facts', unavailable: env.OFF_SEARCH_ENABLED !== '1' ? 'Online packaged-food search is not available on this server. Available foods can still be used.' : undefined,
            work: async (signal: AbortSignal) => {
              if (!await reserveHostedOffSearch()) throw new FoodProviderError('Shared provider quota exceeded', 429);
              return searchOpenFoodFactsPage(query, signal, window);
            }, max: 100 },
        ];
        const results = await Promise.allSettled(providers.map(provider => provider.unavailable ? Promise.resolve(null)
          : options.cursor !== undefined ? Promise.resolve(cache.peek(provider.source, `${Math.min(window, provider.max)}:${query}`) ?? null)
          : cache.get(provider.source, `${Math.min(window, provider.max)}:${query}`, provider.work, request.signal)));
        for (const [index, result] of results.entries()) {
          const provider = providers[index];
          let ready = false;
          if (provider.unavailable) issues.push({ source: provider.source, message: provider.unavailable });
          else if (result.status === 'rejected') issues.push(foodSearchIssue(provider.source, result.reason));
          else if (result.value) {
            // Persist first: every exposed provider identity must be loggable.
            try {
              await cacheDatabaseFoods(result.value.foods);
              fetched.push(...result.value.foods);
              ready = true;
              canExpand ||= result.value.hasMore && window < provider.max;
              if (result.value.rejectedCount) issues.push({ source: provider.source, message: `${result.value.rejectedCount} online matches had incomplete nutrition and were omitted.` });
            } catch {
              issues.push({ source: provider.source, message: 'Could not save online matches. Cached foods are still available; try again later.' });
            }
          }
          const issue = issues.find(issue => issue.source === provider.source);
          const capped = result.status === 'fulfilled' && result.value?.hasMore && window >= provider.max;
          sourceStatus.push({ source: provider.source, state: ready ? 'ready' : issue ? 'unavailable' : 'not-requested', ...(issue ? { message: issue.message } : capped ? { message: `Online search shows up to ${provider.max} matches from this provider. Use a more specific name to narrow the results.` } : {}) });
        }
      } else {
        for (const source of ['USDA FoodData Central', 'Open Food Facts']) sourceStatus.push({ source, state: 'not-requested', ...(options.online && (options.category === 'custom' || options.category === 'restaurant') ? { message: 'This category uses the saved catalog. Online providers do not add restaurant menus or custom foods.' } : {}) });
      }
      const ranked = rankFoodSearch(query, [...fetched, ...local], options);
      return Response.json(paginateFoodSearch(query, { ...ranked, canExpand, partial: issues.length > 0, issues, sourceStatus }, options));
    } catch {
      return Response.json({ error: 'Food search is unavailable. Please try again.' }, { status: 503 });
    }
  });
}
