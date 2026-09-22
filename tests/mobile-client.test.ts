import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, SessionExpiredError } from '../mobile/src/lib/api';
import { localDate, shiftDate, scaleFood } from '../mobile/src/lib/nutrition';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('mobile API contract', () => {
  it('sends the current access token without cookies or user identity fields', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.credentials).toBe('omit');
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer refreshed-token');
      expect(JSON.parse(init.body as string)).toEqual({ calories: 2000 });
      return Response.json({ calories: 2000 });
    });
    vi.stubGlobal('fetch', fetcher);
    const api = createApiClient('https://nourish.example', async () => 'refreshed-token', () => {});
    expect(await api('/api/goals', { method: 'PUT', body: { calories: 2000 } })).toEqual({ calories: 2000 });
    expect(fetcher.mock.calls[0][0]).toBe('https://nourish.example/api/goals');
  });

  it('invalidates the protected session on 401 without retrying a write', async () => {
    const expired = vi.fn();
    const fetcher = vi.fn(async () => Response.json({ error: 'Unauthorized' }, { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    const api = createApiClient('https://nourish.example', async () => 'token', expired);
    await expect(api('/api/entries', { method: 'POST', body: {} })).rejects.toBeInstanceOf(SessionExpiredError);
    expect(expired).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('surfaces service failure without treating it as a sign-out', async () => {
    const expired = vi.fn();
    vi.stubGlobal('fetch', async () => Response.json({ error: 'Diary unavailable' }, { status: 503 }));
    const api = createApiClient('https://nourish.example', async () => 'token', expired);
    await expect(api('/api/day')).rejects.toThrow('Diary unavailable');
    expect(expired).not.toHaveBeenCalled();
  });

  it('never sends credentials to an absolute or protocol-relative URL', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const api = createApiClient('https://nourish.example', async () => 'token', () => {});
    await expect(api('https://evil.example/api/day')).rejects.toThrow();
    await expect(api('//evil.example/api/day')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('releases a stalled custom-food save without replaying it or signing out', async () => {
    vi.useFakeTimers();
    const expired = vi.fn();
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetcher);
    const api = createApiClient('https://nourish.example', async () => 'token', expired);
    const result = expect(api('/api/foods/custom', { method: 'POST', body: {} })).rejects.toThrow(/Check whether your changes were saved/);
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
    expect(fetcher).toHaveBeenCalledOnce();
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal?.aborted).toBe(true);
    expect(expired).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    fetcher.mockResolvedValue(Response.json({ entries: [] }));
    expect(await api('/api/day')).toEqual({ entries: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out a stalled credential lookup and never sends a late write', async () => {
    vi.useFakeTimers();
    let finish!: (value: string) => void;
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const api = createApiClient('https://nourish.example', () => new Promise(resolve => { finish = resolve; }), () => {});
    const result = expect(api('/api/foods/custom', { method: 'POST', body: {} })).rejects.toThrow(/too long/);
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
    finish('late-token');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('bounds a response body that stalls after headers arrive', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async () => ({ status: 200, ok: true, json: () => new Promise(() => {}) }));
    const api = createApiClient('https://nourish.example', async () => 'token', () => {});
    const result = expect(api('/api/day')).rejects.toThrow(/too long/);
    await vi.advanceTimersByTimeAsync(20_000);
    await result;
  });

  it('cancels during credential lookup without waiting for credentials or sending a request', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const api = createApiClient('https://nourish.example', () => new Promise(() => {}), () => {});
    const controller = new AbortController();
    const result = expect(api('/api/day', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    await result;
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
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
