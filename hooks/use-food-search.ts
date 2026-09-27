import { useCallback, useEffect, useRef, useState } from 'react';
import type { FoodApi } from '../lib/food-api';
import type { FoodSearchCategory, FoodSearchHit, FoodSearchResult } from '../lib/food-search';

export const searchCategories = [['all', 'All'], ['generic', 'Generic'], ['packaged', 'Packaged'], ['restaurant', 'Restaurants'], ['custom', 'Custom']] as const;
export function searchHits(result: FoodSearchResult): FoodSearchHit[] {
  const metadata = new Map(result.hits?.map(hit => [hit.food.id, hit]));
  // Compatibility for saved fixtures and older servers: no speculative grouping.
  return result.foods.map(food => metadata.get(food.id) ?? { food, category: food.sourceKind === 'custom' ? 'custom' : food.sourceKind === 'restaurant' || food.id.startsWith('restaurant-') ? 'restaurant' : food.brand ? 'packaged' : 'generic' });
}
export function groupSearchHits(hits: FoodSearchHit[]) {
  const groups: Array<{ key: string; label?: string; hits: FoodSearchHit[] }> = [];
  const trusted = new Map<string, typeof groups[number]>();
  for (const hit of hits) {
    const group = hit.groupKey ? trusted.get(hit.groupKey) : undefined;
    if (group) group.hits.push(hit);
    else { const next = { key: hit.groupKey ? `group:${hit.groupKey}` : `food:${hit.food.id}`, label: hit.groupLabel, hits: [hit] }; groups.push(next); if (hit.groupKey) trusted.set(hit.groupKey, next); }
  }
  return groups;
}
function mergePages(previous: FoodSearchResult, next: FoodSearchResult): FoodSearchResult {
  const foods = [...previous.foods]; const ids = new Set(foods.map(food => food.id));
  for (const food of next.foods) if (!ids.has(food.id)) { ids.add(food.id); foods.push(food); }
  const metadata = new Map([...searchHits(previous), ...searchHits(next)].map(hit => [hit.food.id, hit]));
  return { ...next, foods, hits: foods.map(food => metadata.get(food.id)!), brands: next.brands ?? previous.brands };
}

export function useFoodSearch(api: FoodApi) {
  const [query, updateQuery] = useState('');
  const [category, updateCategory] = useState<FoodSearchCategory | 'all'>('all');
  const [brand, updateBrand] = useState('');
  const [results, setResults] = useState<FoodSearchResult>({ foods: [] });
  const [busy, setBusy] = useState<'local' | 'online' | 'more' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const request = useRef<{ id: number; controller?: AbortController; timer?: ReturnType<typeof setTimeout> }>({ id: 0 });
  const windowSize = useRef(100);
  const [windowCap, setWindowCap] = useState(100);
  const online = useRef(false);
  const automatic = useRef({ allowed: true, completed: false, due: 0, localSettled: false, starts: new Map<string, number>() });
  const scheduleOnlineRef = useRef<() => void>(() => {});
  const invalidate = useCallback(() => { request.current.id++; request.current.controller?.abort(); clearTimeout(request.current.timer); }, []);
  const reset = useCallback(() => { invalidate(); windowSize.current = 100; setWindowCap(100); online.current = false; setResults({ foods: [] }); setError(null); setNotice(null); setBusy(null); }, [invalidate]);
  const setQuery = useCallback((value: string) => { if (value === query) return; reset(); updateQuery(value); updateBrand(''); if (value.trim().length >= 2 && value.trim().length <= 200) setBusy('local'); }, [reset, query]);
  const setCategory = useCallback((value: FoodSearchCategory | 'all') => { if (value === category) return; reset(); updateCategory(value); updateBrand(''); }, [reset, category]);
  const setBrand = useCallback((value: string) => { if (value === brand) return; invalidate(); windowSize.current = 100; setWindowCap(100); online.current = false; setResults(previous => ({ foods: [], brands: previous.brands })); setError(null); setNotice(null); setBusy(null); updateBrand(value); }, [invalidate, brand]);
  const run = useCallback(async (kind: 'local' | 'online' | 'more', append = false) => {
    if (query.trim().length < 2 || query.trim().length > 200) return;
    const cursor = append ? results.nextCursor : undefined;
    invalidate(); const id = request.current.id; const controller = new AbortController(); request.current.controller = controller;
    setBusy(kind); setError(null); setNotice(null);
    const usesOnline = kind === 'online' || (kind === 'more' && online.current);
    const params = new URLSearchParams({ q: query.trim(), online: usesOnline ? '1' : '0', category, limit: '20', window: String(windowSize.current) });
    if (brand) params.set('brand', brand); if (cursor) params.set('cursor', cursor);
    try {
      const data = await api<FoodSearchResult>(`/api/foods/search?${params}`, { signal: controller.signal });
      if (id !== request.current.id || controller.signal.aborted) return;
      online.current = usesOnline;
      setResults(previous => {
        if (append && !data.reset) return mergePages(previous, data);
        if (kind === 'online' && data.partial && !data.reset) {
          const ids = new Set(data.foods.map(food => food.id));
          const retained = previous.foods.filter(food => !ids.has(food.id));
          return { ...data, foods: [...data.foods, ...retained], hits: [...searchHits(data), ...searchHits({ foods: retained, hits: previous.hits })] };
        }
        return data;
      });
      if (data.reset) setNotice('Matches changed. The result list has been refreshed.');
    } catch {
      if (id !== request.current.id || controller.signal.aborted) return;
      setError(kind === 'online' ? 'Some matches are unavailable. Keep using available matches, or retry the search.' : 'Search is unavailable. Keep using available matches, or retry the search.');
    } finally {
      if (id === request.current.id && !controller.signal.aborted) {
        setBusy(null);
        if (kind === 'local') { automatic.current.localSettled = true; scheduleOnlineRef.current(); }
        if (kind === 'online') automatic.current.completed = true;
      }
    }
  }, [api, query, category, brand, results.nextCursor, invalidate]);
  // Mode/selection intentionally do not affect this effect: Back restores the same search.
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; }, [run]);
  const scheduleOnline = useCallback(() => {
    if (!automatic.current.allowed || !automatic.current.localSettled || category === 'restaurant' || category === 'custom') return;
    const now = Date.now();
    const key = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const starts = automatic.current.starts;
    for (const [queryKey, time] of starts) if (time <= now - 60_000) starts.delete(queryKey);
    // A rolling budget keeps automatic typing below the provider limit. Repeated
    // queries/filters use its existing one-minute cache instead of a new slot.
    const availableAt = !starts.has(key) && starts.size >= 10 ? Math.min(...starts.values()) + 60_000 : now;
    clearTimeout(request.current.timer);
    request.current.timer = setTimeout(() => {
      if (!automatic.current.allowed) return;
      automatic.current.allowed = false;
      if (!starts.has(key) || starts.get(key)! <= Date.now() - 60_000) starts.set(key, Date.now());
      void runRef.current('online');
    }, Math.max(0, automatic.current.due - now, availableAt - now));
  }, [query, category]);
  useEffect(() => { scheduleOnlineRef.current = scheduleOnline; }, [scheduleOnline]);
  useEffect(() => {
    invalidate();
    automatic.current.allowed = true;
    automatic.current.completed = false;
    automatic.current.localSettled = false;
    automatic.current.due = Date.now() + 900;
    if (query.trim().length >= 2 && query.trim().length <= 200) { request.current.timer = setTimeout(() => { void runRef.current('local'); }, 100); }
    return invalidate;
  }, [api, query, category, brand, revision, invalidate]);
  const pause = () => { automatic.current.allowed = false; invalidate(); setBusy(null); };
  const submitSearch = () => {
    if (busy === 'online' || busy === 'more') return;
    if (!automatic.current.completed) automatic.current.allowed = true;
    automatic.current.due = Date.now();
    if (!automatic.current.localSettled) void run('local');
    else scheduleOnline();
  };
  const loadMore = async () => { if (busy !== 'local' && busy !== 'more' && results.nextCursor) { automatic.current.allowed = false; await run('more', true); } };
  const findMore = async () => { if (busy === 'local' || busy === 'more' || windowSize.current >= 1000) return; automatic.current.allowed = false; windowSize.current = Math.min(1000, windowSize.current * 2); setWindowCap(windowSize.current); await run('more'); };
  return { query, setQuery, category, setCategory, brand, setBrand, results, busy, error, notice, submitSearch, pause, loadMore, findMore,
    retry: () => setRevision(value => value + 1), clearFilters: () => { reset(); updateCategory('all'); updateBrand(''); },
    canExpand: !!(results.canExpand ?? (results.hasMore && !results.nextCursor)) && windowCap < 1000,
    validQuery: query.trim().length >= 2 && query.trim().length <= 200 };
}
