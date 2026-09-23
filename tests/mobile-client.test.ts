import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../mobile/src/lib/api';
import { localDate, shiftDate, scaleFood } from '../mobile/src/lib/nutrition';

afterEach(() => vi.unstubAllGlobals());

describe('mobile API contract', () => {
  it('sends the diary cookie without bearer tokens or user identity fields', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.credentials).toBe('include');
      expect(new Headers(init.headers).has('Authorization')).toBe(false);
      expect(JSON.parse(init.body as string)).toEqual({ calories: 2000 });
      return Response.json({ calories: 2000 });
    });
    vi.stubGlobal('fetch', fetcher);
    const api = createApiClient('https://gramello.example');
    expect(await api('/api/goals', { method: 'PUT', body: { calories: 2000 } })).toEqual({ calories: 2000 });
    expect(fetcher.mock.calls[0][0]).toBe('https://gramello.example/api/goals');
  });

  it('surfaces API errors without retrying a write', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: 'Diary unavailable' }, { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const api = createApiClient('https://gramello.example');
    await expect(api('/api/entries', { method: 'POST', body: {} })).rejects.toThrow('Diary unavailable');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('uses the current browser origin by default', async () => {
    const fetcher = vi.fn(async () => Response.json({ entries: [] }));
    vi.stubGlobal('fetch', fetcher);
    await expect(createApiClient()('/api/day')).resolves.toEqual({ entries: [] });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/day', expect.objectContaining({ credentials: 'include' }));
  });

  it('reports unreadable responses', async () => {
    vi.stubGlobal('fetch', async () => new Response('not json'));
    await expect(createApiClient()('/api/day')).rejects.toThrow('unreadable response');
  });

  it('never sends credentials to an absolute or protocol-relative URL', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const api = createApiClient('https://gramello.example');
    await expect(api('https://evil.example/api/day')).rejects.toThrow();
    await expect(api('//evil.example/api/day')).rejects.toThrow();
    await expect(api('/api/../../other')).rejects.toThrow();
    await expect(api('/api/%2e%2e/other')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('mobile nutrition and calendar', () => {
  const oats = { calories: 380, protein: 14, carbs: 66, fat: 6, servingGrams: 40 };
  it('converts per-100g nutrition to fractional servings and exact weights', () => {
    expect(scaleFood(oats, 1.5, 'serving')).toEqual({ grams: 60, calories: 228, protein: 8.4, carbs: 39.6, fat: 3.5999999999999996 });
    expect(scaleFood(oats, 25, 'grams')).toEqual({ grams: 25, calories: 95, protein: 3.5, carbs: 16.5, fat: 1.5 });
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid quantity %s before submission', quantity => {
    expect(scaleFood(oats, quantity, 'grams')).toBeNull();
  });
  it('uses the local date and shifts safely across leap days and year boundaries', () => {
    expect(localDate(new Date(2026, 8, 19, 23, 59))).toBe('2026-09-19');
    expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
