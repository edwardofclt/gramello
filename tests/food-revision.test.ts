import { beforeEach, expect, it, vi } from 'vitest';
import type { Food } from '../lib/food';
import { foodRevision, validateReviewedFood } from '../lib/food-revision';

const saved = vi.hoisted(() => ({ food: null as Food | null, add: vi.fn(async (_owner: string, item: unknown) => item) }));
vi.mock('@/lib/browser-diary', () => ({ withBrowserDiary: (_request: Request, run: (diary: { userId: string }) => unknown) => run({ userId: 'owner' }) }));
vi.mock('@/db/foods', () => ({ getFood: async () => saved.food }));
vi.mock('@/db/store', () => ({ addEntry: saved.add }));
vi.mock('@/db/meals', () => ({ getMeal: async () => null }));
import { POST } from '../app/api/entries/route';

const food: Food = { id: 'off-1', name: 'Oats', source: 'Open Food Facts', sourceKind: 'database', nutritionBasis: '100g', servingGrams: 40, servingLabel: '40 g', calories: 380, protein: 14, carbs: 60, fat: 8 };
beforeEach(() => { saved.food = food; saved.add.mockClear(); });
const request = (revision?: string) => new Request('https://example.com/api/entries', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    date: '2026-09-25', meal: 'Breakfast', sourceId: food.id, name: 'Oats', quantity: 1, unit: 'serving',
    calories: 152, protein: 5.6, carbs: 24, fat: 3.2, grams: 40, ...(revision && { foodRevision: revision }),
  }),
});

it('detects nutrition, portion, or identity changes but ignores a refreshed source timestamp', () => {
  const revision = foodRevision(food);
  expect(() => validateReviewedFood({ ...food, checkedAt: '2026-09-25' }, revision)).not.toThrow();
  for (const patch of [{ calories: 450 }, { servingGrams: 50 }, { servingLabel: '50 g' }, { name: 'Cooked oats' }]) {
    expect(() => validateReviewedFood({ ...food, ...patch }, revision)).toThrow(/changed/);
  }
});

it('rejects a changed selected food before writing and accepts a freshly reviewed portion', async () => {
  const previous = foodRevision(food);
  saved.food = { ...food, calories: 400 };
  const stale = await POST(request(previous));
  expect(stale.status).toBe(409);
  expect(saved.add).not.toHaveBeenCalled();
  const current = await POST(request(foodRevision(saved.food)));
  expect(current.status).toBe(201);
  expect(await current.json()).toMatchObject({ calories: 160 });
});

it('does not turn a deleted reviewed food into an unverified legacy snapshot', async () => {
  saved.food = null;
  expect((await POST(request(foodRevision(food)))).status).toBe(409);
  expect(saved.add).not.toHaveBeenCalled();
});

it('preserves compatibility for legacy requests without a revision', async () => {
  expect((await POST(request())).status).toBe(201);
});
