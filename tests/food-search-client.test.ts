// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useFoodSearch, groupSearchHits } from '../hooks/use-food-search';
import type { FoodApi } from '../lib/food-api';
import type { FoodSearchResult } from '../lib/food-search';
const food = (id: string) => ({ id, name: id, source: 'USDA', servingGrams: 100, servingLabel: '100 g', calories: 200, protein: 10, carbs: 20, fat: 5 });
let root: Root, container: HTMLDivElement, search: ReturnType<typeof useFoodSearch>;
function Harness({ api }: { api: FoodApi }) { const value = useFoodSearch(api); useEffect(() => { search = value; }); return null; }
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function type(query: string) { await act(async () => search.setQuery(query)); await act(async () => vi.advanceTimersByTimeAsync(150)); }
async function expand() { await act(async () => vi.advanceTimersByTimeAsync(900)); }
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('typing shows local matches first and automatically expands after a pause without blocking selection', async () => {
  const online = deferred<FoodSearchResult>(); const request = vi.fn((path: string) => path.includes('online=1') ? online.promise : Promise.resolve({ foods: [food('local')] }));
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi })));
  await type('oats'); expect(request).toHaveBeenCalledTimes(1); expect(request.mock.calls[0][0]).toContain('online=0'); expect(request.mock.calls[0][0]).toContain('limit=20');
  await expand(); expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls[1][0]).toContain('online=1'); expect(search.results.foods[0].id).toBe('local'); expect(search.busy).toBe('online');
  await act(async () => online.reject(new Error('offline'))); expect(search.results.foods[0].id).toBe('local'); expect(search.error).toContain('available matches');
});
it('late uncooperative responses cannot overwrite newer queries and back navigation does not refetch', async () => {
  const old = deferred<FoodSearchResult>(); const request = vi.fn((path: string) => path.includes('q=old') ? old.promise : Promise.resolve({ foods: [food('new')] }));
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi }))); await type('old'); await type('new');
  await act(async () => old.resolve({ foods: [food('old')] })); expect(search.results.foods[0].id).toBe('new');
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi }))); expect(request).toHaveBeenCalledTimes(2);
});
it('filters and brand refinements start local pages; cursor append deduplicates and reset replaces', async () => {
  let reset = false; const request = vi.fn(async (path: string) => path.includes('cursor=') ? { foods: reset ? [food('refreshed')] : [food('one'), food('two')], reset } : { foods: [food('one')], nextCursor: 'page2', brands: ['Kitchen'] });
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi }))); await type('rice');
  await act(async () => search.setCategory('restaurant')); await act(async () => vi.advanceTimersByTimeAsync(150)); expect(request.mock.calls.at(-1)?.[0]).toContain('category=restaurant');
  await act(async () => search.setBrand('Kitchen')); await act(async () => vi.advanceTimersByTimeAsync(150)); expect(request.mock.calls.at(-1)?.[0]).toContain('brand=Kitchen');
  await act(async () => search.loadMore()); expect(search.results.foods.map(f => f.id)).toEqual(['one', 'two']);
  await act(async () => search.retry()); await act(async () => vi.advanceTimersByTimeAsync(150)); reset = true; await act(async () => search.loadMore()); expect(search.results.foods.map(f => f.id)).toEqual(['refreshed']); expect(search.notice).toContain('refreshed');
});
it('expanding the candidate window refreshes ranking, and untrusted same-name rows stay distinct', async () => {
  const request = vi.fn(async (path: string) => ({ foods: [food(path.includes('window=200') ? 'new-rank' : 'old-rank')], canExpand: true }));
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi }))); await type('chicken'); await act(async () => search.findMore()); expect(request.mock.calls.at(-1)?.[0]).toContain('window=200'); expect(search.results.foods.map(f => f.id)).toEqual(['new-rank']);
  const a = { food: { ...food('raw'), name: 'Chicken' }, category: 'generic' as const }; const b = { ...a, food: { ...food('cooked'), name: 'Chicken' } };
  expect(groupSearchHits([a, b])).toHaveLength(2); expect(groupSearchHits([{ ...a, groupKey: 'trusted' }, { ...b, groupKey: 'trusted' }])).toHaveLength(1);
});

it('online partial failures retain local matches and active filter taps are harmless', async () => {
  const request = vi.fn(async (path: string) => path.includes('online=1') ? { foods: [], partial: true, issues: [{ source: 'Provider', message: 'Unavailable' }] } : { foods: [food('available')] });
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi }))); await type('beans');
  await act(async () => search.setCategory('all')); expect(search.results.foods[0].id).toBe('available'); expect(request).toHaveBeenCalledTimes(1);
  await expand(); expect(search.results.foods[0].id).toBe('available'); expect(search.results.partial).toBe(true);
});

it('debounces online work across typing and waits for slow local results before expanding', async () => {
  const local = deferred<FoodSearchResult>();
  const request = vi.fn((path: string) => path.includes('online=1') ? Promise.resolve({ foods: [food('remote')] }) : local.promise);
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi })));
  await type('oa'); await type('oat'); await type('oats');
  await expand(); expect(request.mock.calls.every(([path]) => path.includes('online=0'))).toBe(true);
  await act(async () => local.resolve({ foods: [food('local')] }));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(request.mock.calls.filter(([path]) => path.includes('online=1'))).toHaveLength(1);
  expect(request.mock.calls.at(-1)?.[0]).toContain('q=oats');
});

it('choosing a food pauses pending expansion and ignores an already running late response', async () => {
  const online = deferred<FoodSearchResult>();
  const request = vi.fn((path: string) => path.includes('online=1') ? online.promise : Promise.resolve({ foods: [food('local')] }));
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi })));
  await type('rice'); await act(async () => search.pause()); await expand(); expect(request).toHaveBeenCalledTimes(1);
  await type('oats'); await expand(); expect(search.busy).toBe('online');
  await act(async () => search.pause());
  await act(async () => online.resolve({ foods: [food('late')] }));
  expect(search.results.foods[0].id).toBe('local'); expect(search.busy).toBeNull();
});

it('skips providers for personal and restaurant categories and does not reset a paged list', async () => {
  const request = vi.fn(async (path: string) => ({ foods: [food(path.includes('cursor=') ? 'two' : 'one')], nextCursor: path.includes('cursor=') ? undefined : 'next' }));
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi })));
  await type('chicken'); await act(async () => search.loadMore()); await expand();
  expect(search.results.foods.map(item => item.id)).toEqual(['one', 'two']);
  for (const category of ['custom', 'restaurant'] as const) {
    await act(async () => search.setCategory(category)); await expand();
    await act(async () => search.submitSearch()); await expand();
  }
  expect(request.mock.calls.every(([path]) => path.includes('online=0'))).toBe(true);
});

it('loading another page interrupts a slow background lookup without losing the local cursor', async () => {
  const online = deferred<FoodSearchResult>();
  const request = vi.fn((path: string) => path.includes('online=1') ? online.promise
    : Promise.resolve(path.includes('cursor=') ? { foods: [food('two')] } : { foods: [food('one')], nextCursor: 'next' }));
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi })));
  await type('rice'); await expand(); expect(search.busy).toBe('online');
  await act(async () => search.loadMore());
  expect(request.mock.calls.at(-1)?.[0]).toContain('online=0');
  expect(request.mock.calls.at(-1)?.[0]).toContain('cursor=next');
  expect(search.results.foods.map(item => item.id)).toEqual(['one', 'two']);
  await act(async () => online.resolve({ foods: [food('late')] }));
  expect(search.results.foods.map(item => item.id)).toEqual(['one', 'two']);
});

it.each([false, true])('Enter expedites a pending search after pause=%s and repeated submits do not duplicate it', async paused => {
  const request = vi.fn(async (path: string) => ({ foods: [food(path.includes('online=1') ? 'remote' : 'local')] }));
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi })));
  await type('bread');
  if (paused) await act(async () => search.pause());
  await act(async () => search.submitSearch());
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => search.submitSearch()); await expand(); expect(request).toHaveBeenCalledTimes(2);
});

it('bounds automatic provider starts and only expands the latest query when quota becomes available', async () => {
  const request = vi.fn(async (path: string) => ({ foods: [food(path.includes('online=1') ? 'remote' : 'local')] }));
  await act(async () => root.render(createElement(Harness, { api: request as FoodApi })));
  for (let index = 0; index < 12; index++) { await type(`food ${index}`); await expand(); }
  const remote = () => request.mock.calls.filter(args => String(args[0]).includes('online=1'));
  expect(remote()).toHaveLength(10);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(remote()).toHaveLength(11); expect(String(remote().at(-1)?.[0])).toContain('q=food+11');
});
