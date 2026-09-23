import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/lib/api';
import { withAnalytics } from '../src/analytics/api';
import { trackEvent } from '../src/analytics/client';

vi.mock('../src/analytics/client', () => ({ trackEvent: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup(status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(status === 200 ? { saved: true } : { error: 'Failed' }), { status })));
  return withAnalytics(createApiClient('https://gramello.test'));
}

describe('mobile action analytics', () => {
  it.each([
    ['POST', '/api/entries', 'Food Logged'], ['DELETE', '/api/entries?id=private', 'Food Removed'],
    ['PUT', '/api/entries?id=private', 'Food Updated'],
    ['PUT', '/api/goals', 'Goals Updated'], ['POST', '/api/foods/custom', 'Custom Food Created'],
    ['POST', '/api/meals', 'Meal Created'], ['PUT', '/api/meals?id=private', 'Meal Updated'],
    ['DELETE', '/api/meals?id=private', 'Meal Deleted'], ['POST', '/api/water', 'Water Logged'],
    ['DELETE', '/api/water?id=private', 'Water Removed'], ['PUT', '/api/water/goals', 'Water Goal Updated'],
    ['GET', '/api/foods/search?q=private', 'Food Searched'], ['GET', '/api/foods/barcode?code=private', 'Barcode Looked Up'],
  ] as const)('tracks a successful %s %s without sending its data', async (method, path, name) => {
    const api = setup();
    await expect(api(path, { method, ...(method !== 'GET' && { body: { name: 'Private meal', calories: 450 } }) })).resolves.toEqual({ saved: true });
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith(name);
  });

  it.each([401, 422, 500])('does not count a rejected request (%s)', async status => {
    const api = setup(status);
    await expect(api('/api/entries', { method: 'POST' })).rejects.toThrow();
    await expect(api('/api/entries?id=private', { method: 'PUT' })).rejects.toThrow();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('does not count cancelled requests', async () => {
    const api = setup();
    const controller = new AbortController(); controller.abort();
    await expect(api('/api/entries', { method: 'POST', signal: controller.signal })).rejects.toThrow();
    await expect(api('/api/entries?id=private', { method: 'PUT', signal: controller.signal })).rejects.toThrow();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('does not turn routine data refreshes or unknown endpoints into events', async () => {
    const api = setup();
    await api('/api/entries?date=private');
    await api('/api/water?date=private');
    await api('/api/unknown', { method: 'POST' });
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
