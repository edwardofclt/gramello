import { afterEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/local-sqlite';
import { createCatalogReader } from '../mobile/src/catalog/queries';
import { createFoodLookup } from '../mobile/src/catalog/lookup';
import { createLocalRepository, type FoodCatalog } from '../mobile/src/local/repository';
import { createLocalApi } from '../mobile/src/local/api';
import type { Food } from '../lib/food';

// A different, existing Rice Krispies Treats barcode; the reported 038000590962
// is absent from OFF and must remain a genuine not-found result.
const product = {
  code: '0038000590993', product_name: 'Rice Krispies Treats Original Mega Size', brands: "Kellogg's",
  serving_quantity: 62, serving_quantity_unit: 'g', serving_size: '1 bar (62 g)',
  nutriments: { 'energy-kcal_100g': 419.3548, proteins_100g: 3.2258, carbohydrates_100g: 77.4194, fat_100g: 9.6774 },
};
const databases: ReturnType<typeof testDatabase>[] = [];
function open(path?: string) { const db = testDatabase(path); databases.push(db); return db.db; }
async function setup(override?: FoodCatalog) {
  const openedCatalog = open('mobile/assets/catalog.sqlite');
  const catalog = override ?? createCatalogReader(work => work(openedCatalog));
  const cache = open(), personal = open();
  async function reopen() {
    const lookup = await createFoodLookup(catalog, cache);
    const repo = await createLocalRepository(personal, lookup);
    return { repo, api: createLocalApi(repo) };
  }
  return { ...await reopen(), reopen };
}
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.raw.close(); });

describe('native food discovery', () => {
  it('finds Thomas’ bread by name or brand online, from saved lookups, and in private foods', async () => {
    const bread = { ...product, product_name: 'Thomas’ Cinnamon Raisin Bread', brands: 'Thomas’' };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ products: [bread] })));
    const { api, reopen } = await setup();
    await expect(api('/api/foods/search?q=Thomas')).resolves.toMatchObject({ foods: expect.arrayContaining([expect.objectContaining({ id: `off-${bread.code}` })]) });
    const { api: offline } = await reopen();
    const custom = await offline<{ food: Food }>('/api/foods/custom', { method: 'POST', body: { name: 'Cinnamon-Raisin Bread', brand: "Thomas'", servingLabel: '1 slice', calories: 100, protein: 3, carbs: 20, fat: 1 } });
    for (const query of ['Thomas', 'Thomas’', "Thomas'", 'Thomas cinnamon-raisin']) {
      const result = await offline<{ foods: Food[] }>(`/api/foods/search?q=${encodeURIComponent(query)}&online=0`);
      expect(result.foods).toEqual(expect.arrayContaining([expect.objectContaining({ id: `off-${bread.code}` }), expect.objectContaining({ id: custom.food.id })]));
    }
  });
  it('keeps real eggs first online and offline and does not cache unrelated provider matches', async () => {
    const egg = { ...product, code: '012345678905', product_name: 'Large eggs', brands: 'Test farm' };
    const mayo = { ...product, code: '012345678912', product_name: "Mayonnaise Classique à l’huile de colza", brands: 'Lesieur' };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ products: [mayo, egg] })));
    const { api, reopen } = await setup();
    const online = await api<{ foods: Food[] }>('/api/foods/search?q=Eggs');
    expect(online.foods.slice(0, 10).some(food => food.id === 'usda-171287')).toBe(true);
    expect(online.foods.some(food => food.id === `off-${egg.code}`)).toBe(true);
    expect(online.foods.some(food => food.id === `off-${mayo.code}`)).toBe(false);
    const next = await reopen();
    const offline = await next.api<{ foods: Food[] }>('/api/foods/search?q=eggs&online=0');
    expect(offline.foods.slice(0, 10).some(food => food.id === 'usda-171287')).toBe(true);
    expect(offline.foods.some(food => food.id === `off-${egg.code}`)).toBe(true);
    await expect(next.api('/api/foods/search?q=mayonnaise&online=0')).resolves.not.toMatchObject({ foods: expect.arrayContaining([expect.objectContaining({ id: `off-${mayo.code}` })]) });
    await expect(next.api('/api/entries', { method: 'POST', body: { date: '2026-09-23', meal: 'Breakfast', sourceId: 'usda-171287', quantity: 1, unit: 'serving' } })).resolves.toMatchObject({ sourceId: 'usda-171287' });
  });
  it('matches private singular foods for plural queries and ranks them with catalog matches', async () => {
    const { api } = await setup();
    const created = await api<{ food: Food }>('/api/foods/custom', { method: 'POST', body: { name: 'Egg', servingLabel: '1 egg', calories: 72, protein: 6, carbs: 0, fat: 5 } });
    const results = await api<{ foods: Food[] }>('/api/foods/search?q=eggs&online=0');
    expect(results.foods[0].id).toBe(created.food.id);
  });
  it('supports native AbortSignals without the browser throwIfAborted method', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'throwIfAborted')!;
    Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', { value: undefined, configurable: true });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 1, product, products: [product] })));
    try {
      const { api } = await setup(), controller = new AbortController();
      await expect(api('/api/foods/barcode?code=038000590993', { signal: controller.signal })).resolves.toMatchObject({ food: { id: 'off-0038000590993' } });
      await expect(api('/api/foods/search?q=rice%20krispies&online=1', { signal: controller.signal })).resolves.toMatchObject({ partial: false, foods: expect.arrayContaining([expect.objectContaining({ id: 'off-0038000590993' })]) });
    } finally { Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', descriptor); }
  });
  it('finds an unbundled barcode online, then finds and logs it offline after reopening', async () => {
    const fetch = vi.fn(async () => Response.json({ status: 1, product })); vi.stubGlobal('fetch', fetch);
    const { api, reopen } = await setup();
    const result = await api<{ food: Food }>('/api/foods/barcode?code=038000590993');
    expect(result.food).toMatchObject({ id: 'off-0038000590993', servingGrams: 62 });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('offline'); }));
    const next = await reopen();
    await expect(next.api('/api/foods/barcode?code=00038000590993')).resolves.toMatchObject({ food: { id: result.food.id } });
    await expect(next.api('/api/foods/search?q=038000590993')).resolves.toMatchObject({ foods: [{ id: 'off-0038000590993', servingGrams: 62 }], partial: false });
    await expect(next.api('/api/foods/search?q=rice%20krispies')).resolves.toMatchObject({ foods: expect.arrayContaining([expect.objectContaining({ id: 'off-0038000590993', servingGrams: 62 })]) });
    const entry = await next.api<Food>('/api/entries', { method: 'POST', body: { date: '2026-09-22', meal: 'Snacks', sourceId: result.food.id, quantity: 1, unit: 'serving' } });
    expect(entry.calories).toBeCloseTo(260); expect(entry.carbs).toBeCloseTo(48);
    expect(entry.protein).toBeCloseTo(2); expect(entry.fat).toBeCloseTo(6);
  });
  it('looks up a barcode entered in online search without treating it as a food name', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ status: 1, product })); vi.stubGlobal('fetch', fetch);
    const { api } = await setup();
    await expect(api('/api/foods/search?q=038000590993&online=1')).resolves.toMatchObject({ foods: [expect.objectContaining({ id: 'off-0038000590993' })], partial: false });
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/product/038000590993?');
  });
  it('prefers installed barcode records and supports explicitly offline name searches', async () => {
    const food: Food = { id: 'usda-1', name: 'Rice', source: 'USDA', servingGrams: 100, servingLabel: '100 g', calories: 130, protein: 3, carbs: 28, fat: 0 };
    const fetch = vi.fn(() => { throw new Error('offline'); }); vi.stubGlobal('fetch', fetch);
    const { api } = await setup({ getFood: async () => food, search: async () => [food], barcode: async () => food });
    await expect(api('/api/foods/barcode?code=038000590993')).resolves.toEqual({ food });
    await expect(api('/api/foods/search?q=rice&online=0')).resolves.toMatchObject({ foods: [food], partial: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('automatically searches online and keeps the products available when the provider is unreachable', async () => {
    const fetch = vi.fn(async () => Response.json({ products: [product] })); vi.stubGlobal('fetch', fetch);
    const { api, reopen } = await setup();
    await expect(api('/api/foods/search?q=rice%20krispies')).resolves.toMatchObject({ foods: expect.arrayContaining([expect.objectContaining({ id: 'off-0038000590993' })]), partial: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('offline'); }));
    const next = await reopen();
    await expect(next.api('/api/foods/barcode?code=038000590993')).resolves.toMatchObject({ food: { id: 'off-0038000590993' } });
    await expect(next.api('/api/foods/search?q=rice%20krispies')).resolves.toMatchObject({
      foods: expect.arrayContaining([expect.objectContaining({ id: 'off-0038000590993' })]), partial: true,
      issues: [{ source: 'Open Food Facts', message: expect.stringMatching(/connection/i) }],
    });
  });
  it.each([
    ['rate limit', () => Promise.resolve(new Response('', { status: 429 })), /too many requests/i],
    ['service failure', () => Promise.resolve(new Response('', { status: 503 })), /service problem/i],
    ['timeout', () => Promise.reject(new DOMException('Timed out', 'TimeoutError')), /too long/i],
  ])('explains a search %s while preserving downloaded foods', async (_name, fetch, message) => {
    vi.stubGlobal('fetch', fetch);
    const { api } = await setup();
    await expect(api('/api/foods/search?q=banana')).resolves.toMatchObject({
      foods: expect.arrayContaining([expect.objectContaining({ id: 'usda-173944' })]), partial: true,
      issues: [{ source: 'Open Food Facts', message: expect.stringMatching(message) }],
    });
  });
  it('can narrow a broad search to a cached product while offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ products: [{ ...product, product_name: 'Chocolate cereal bar' }] })));
    const { api, reopen } = await setup();
    await api('/api/foods/search?q=chocolate&online=1');
    const next = await reopen();
    const result = await next.api<{ foods: Food[]; hasMore: boolean }>('/api/foods/search?q=chocolate&online=0');
    expect(result.foods).toHaveLength(100);
    expect(result.hasMore).toBe(true);
    const narrowed = await next.api<{ foods: Food[] }>('/api/foods/search?q=chocolate%20cereal&online=0');
    expect(narrowed.foods.some(food => food.id === 'off-0038000590993')).toBe(true);
  });
  it('returns fresh provider nutrition instead of overwriting it with an older cached match', async () => {
    const fetch = vi.fn(async () => Response.json({ products: [product] })); vi.stubGlobal('fetch', fetch);
    const { api } = await setup();
    await api('/api/foods/search?q=rice%20krispies&online=1');
    fetch.mockImplementation(async () => Response.json({ products: [{ ...product, nutriments: { ...product.nutriments, 'energy-kcal_100g': 400 } }] }));
    const result = await api<{ foods: Food[] }>('/api/foods/search?q=rice%20krispies&online=1');
    expect(result.foods.find(food => food.id === 'off-0038000590993')?.calories).toBe(400);
  });
  it('does not substitute a similar product for the reported missing barcode or cache the miss', async () => {
    const fetch = vi.fn(async () => Response.json({ status: 0, code: '038000590962' }, { status: 404 })); vi.stubGlobal('fetch', fetch);
    const { api } = await setup();
    await expect(api('/api/foods/barcode?code=038000590962')).rejects.toThrow('No product found');
    fetch.mockImplementation(async () => Response.json({ status: 1, product }));
    await expect(api('/api/foods/barcode?code=038000590962')).rejects.toThrow('different barcode');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('retries provider outages without caching them, and rejects incomplete nutrition', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 })); vi.stubGlobal('fetch', fetch);
    const { api } = await setup();
    await expect(api('/api/foods/barcode?code=038000590993')).rejects.toThrow('unavailable');
    fetch.mockImplementation(async () => Response.json({ status: 1, product: { ...product, nutriments: {} } }));
    await expect(api('/api/foods/barcode?code=038000590993')).rejects.toThrow('missing nutrition');
    fetch.mockImplementation(async () => Response.json({ status: 1, product }));
    await expect(api('/api/foods/barcode?code=038000590993')).resolves.toMatchObject({ food: { id: 'off-0038000590993' } });
  });
  it('propagates cancellation and keeps the diary usable while a provider is pending', async () => {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const fetch = vi.fn(async () => { started(); await new Promise<void>(resolve => { release = resolve; }); return Response.json({ status: 1, product }); });
    vi.stubGlobal('fetch', fetch);
    const { api } = await setup();
    const controller = new AbortController();
    const pending = api('/api/foods/barcode?code=038000590993', { signal: controller.signal });
    const cancelled = expect(pending).rejects.toThrow();
    await ready;
    try {
      await expect(api('/api/water', { method: 'POST', body: { date: '2026-09-22', amountMl: 250 } })).resolves.toMatchObject({ amountMl: 250 });
      controller.abort();
    } finally { release(); }
    await cancelled;
    fetch.mockImplementation(async () => new Response('', { status: 503 }));
    await expect(api('/api/foods/barcode?code=038000590993')).rejects.toThrow('unavailable');
  });
  it('does not exceed provider limits and still serves offline results when the limit is reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 0 }, { status: 404 })));
    const { api } = await setup();
    for (let i = 0; i < 15; i++) await expect(api('/api/foods/barcode?code=038000590962')).rejects.toThrow('No product found');
    await expect(api('/api/foods/barcode?code=038000590962')).rejects.toThrow('Too many');
    await expect(api('/api/foods/search?q=banana&online=0')).resolves.toMatchObject({ foods: expect.arrayContaining([expect.objectContaining({ id: 'usda-173944' })]), partial: false });
  });
});
