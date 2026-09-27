import { expect, it, vi } from 'vitest';
import { createProviderCache } from '../lib/search/provider-cache';
import { FoodProviderError } from '../lib/food-search';

it('coalesces normalized queries without letting one caller cancel another', async () => {
  const cache = createProviderCache<number>();
  let release!: (n: number) => void;
  const fetch = vi.fn(() => new Promise<number>(resolve => { release = resolve; }));
  const controller = new AbortController();
  const first = cache.get('off', 'Chicken  Rice', fetch, controller.signal);
  const failure = expect(first).rejects.toThrow();
  const second = cache.get('off', 'chicken rice', fetch);
  await Promise.resolve(); controller.abort(); release(42);
  await failure; expect(await second).toBe(42); expect(fetch).toHaveBeenCalledTimes(1);
  expect(await cache.get('off', 'CHICKEN rice', fetch)).toBe(42);
});
it('backs off all queries to a rate-limited provider, but does not cache other errors', async () => {
  let now = 1000;
  const cache = createProviderCache<number>({ now: () => now });
  const limited = vi.fn(async () => { throw new FoodProviderError('limit', 429); });
  await expect(cache.get('off','rice',limited)).rejects.toThrow();
  await expect(cache.get('off','oats',limited)).rejects.toThrow();
  expect(limited).toHaveBeenCalledTimes(1);
  now += 61000; expect(await cache.get('off','oats',async () => 1)).toBe(1);
});
it('evicts bounded query results and retries ordinary failures', async () => {
  const cache = createProviderCache<number>({ maxEntries: 2 });
  const work = vi.fn(async () => 1);
  await cache.get('off', 'one', work); await cache.get('off', 'two', work); await cache.get('off', 'three', work);
  await cache.get('off', 'one', work); expect(work).toHaveBeenCalledTimes(4);
  const unavailable = vi.fn(async () => { throw new FoodProviderError('unavailable', 503); });
  await expect(cache.get('off', 'failure', unavailable)).rejects.toThrow();
  await expect(cache.get('off', 'failure', unavailable)).rejects.toThrow();
  expect(unavailable).toHaveBeenCalledTimes(2);
});
it('peeks only completed unexpired normalized results without starting work', async () => {
  let now = 1000;
  const cache = createProviderCache<number>({ now: () => now });
  let release!: (n: number) => void;
  const pending = cache.get('off', 'Rice Cakes', () => new Promise<number>(resolve => { release = resolve; }));
  await Promise.resolve();
  expect(cache.peek('off', 'rice cakes')).toBeUndefined();
  release(7); await pending;
  expect(cache.peek('off', 'RICE  cakes')).toBe(7);
  now += 60_000;
  expect(cache.peek('off', 'rice cakes')).toBeUndefined();
});
