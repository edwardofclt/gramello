import type { FoodSearchCategory, FoodSearchOptions, FoodSearchResult } from '../food-search';

const categories = new Set<FoodSearchCategory | 'all'>(['all', 'generic', 'packaged', 'restaurant', 'custom']);

function bounded(value: unknown, fallback: number, maximum: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

export function parseFoodSearchOptions(params: URLSearchParams): FoodSearchOptions {
  const category = params.get('category') as FoodSearchCategory | 'all' | null;
  return {
    online: params.get('online') !== '0',
    category: category && categories.has(category) ? category : 'all',
    ...(params.has('brand') && { brand: params.get('brand')!.trim().slice(0, 120) }),
    ...(params.has('limit') && { limit: bounded(params.get('limit'), 20, 100) }),
    window: bounded(params.get('window'), 100, 1000),
    ...(params.has('cursor') && { cursor: params.get('cursor')!.slice(0, 256) }),
  };
}

// A change detector, not an authorization token. It binds continuation to the
// actual ranked window, including nutrition, on both native and hosted clients.
function fingerprint(value: string) {
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function paginateFoodSearch(query: string, result: FoodSearchResult, options: FoodSearchOptions = {}): FoodSearchResult {
  const limit = bounded(options.limit, 100, 100);
  const key = fingerprint(JSON.stringify([
    1, query.normalize('NFKC').trim().toLowerCase(), options.category ?? 'all', options.brand ?? '',
    bounded(options.window, 100, 1000), limit, options.online ?? true, result.foods, result.hits,
  ]));
  let offset = 0, reset = false;
  if (options.cursor !== undefined) {
    const match = /^1\.([a-z0-9]+)\.(\d{1,7})$/.exec(options.cursor);
    const requested = match ? Number(match[2]) : -1;
    if (match?.[1] === key && requested > 0 && requested < result.foods.length && requested % limit === 0) offset = requested;
    else reset = true;
  }
  const end = Math.min(offset + limit, result.foods.length);
  const rest = { ...result };
  delete rest.nextCursor;
  delete rest.reset;
  return {
    ...rest, foods: result.foods.slice(offset, end),
    ...(result.hits && { hits: result.hits.slice(offset, end) }),
    hasMore: end < result.foods.length,
    ...(end < result.foods.length && { nextCursor: `1.${key}.${end}` }),
    ...(reset && { reset: true }),
  };
}
