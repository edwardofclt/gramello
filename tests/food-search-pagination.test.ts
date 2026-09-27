import { describe, expect, it } from 'vitest';
import type { Food } from '../lib/food';
import { paginateFoodSearch, parseFoodSearchOptions } from '../lib/search/pagination';

const foods: Food[] = Array.from({ length: 125 }, (_, index) => ({
  id: `food-${index}`, name: `Food ${index}`, source: 'Test',
  servingGrams: 100, servingLabel: '100 g', calories: 100, protein: 2, carbs: 3, fat: 4,
}));

describe('food search continuation', () => {
  it('pages a ranked window without skipping or duplicating the next food', () => {
    const first = paginateFoodSearch('food', { foods }, { limit: 20 });
    expect(first.foods).toHaveLength(20);
    expect(first.foods.at(-1)?.id).toBe('food-19');
    const next = paginateFoodSearch('food', { foods }, { limit: 20, cursor: first.nextCursor });
    expect(next.foods[0].id).toBe('food-20');
    expect(next.foods.at(-1)?.id).toBe('food-39');
    expect(next.reset).not.toBe(true);
  });

  it('restarts explicitly when the ranked window or nutrition changes', () => {
    const first = paginateFoodSearch('food', { foods }, { limit: 20 });
    for (const changed of [[...foods].reverse(), foods.map((food, index) => index === 0 ? { ...food, calories: 200 } : food)]) {
      const next = paginateFoodSearch('food', { foods: changed }, { limit: 20, cursor: first.nextCursor });
      expect(next.reset).toBe(true);
      expect(next.foods[0]).toEqual(changed[0]);
    }
  });

  it('does not reuse continuation after a query, filter, page size or candidate budget changes', () => {
    const first = paginateFoodSearch('food', { foods }, { limit: 20 });
    for (const changes of [{ category: 'generic' as const }, { brand: 'Acme' }, { window: 200 }, { limit: 30 }, { online: false }]) {
      expect(paginateFoodSearch('food', { foods }, { limit: 20, ...changes, cursor: first.nextCursor }).reset).toBe(true);
    }
    expect(paginateFoodSearch('different', { foods }, { limit: 20, cursor: first.nextCursor }).reset).toBe(true);
  });

  it('rejects malformed cursors and keeps hit metadata aligned with visible foods', () => {
    const result = paginateFoodSearch('food', { foods, hits: foods.map(food => ({ food, category: 'generic' as const })), canExpand: true }, { limit: 20, cursor: 'invalid-token' });
    expect(result.reset).toBe(true);
    expect(result.hits?.map(hit => hit.food.id)).toEqual(result.foods.map(food => food.id));
    expect(result.canExpand).toBe(true);
  });

  it('distinguishes a completed page window from additional retrievable candidates', () => {
    const first = paginateFoodSearch('food', { foods: foods.slice(0, 25), canExpand: true }, { limit: 20 });
    const final = paginateFoodSearch('food', { foods: foods.slice(0, 25), canExpand: true }, { limit: 20, cursor: first.nextCursor });
    expect(final.foods).toHaveLength(5);
    expect(final.nextCursor).toBeUndefined();
    expect(final.hasMore).toBe(false);
    expect(final.canExpand).toBe(true);
  });

  it('preserves the legacy page size and bounds untrusted request parameters', () => {
    expect(paginateFoodSearch('food', { foods }).foods).toHaveLength(100);
    expect(parseFoodSearchOptions(new URLSearchParams('online=0&category=restaurant&brand=Acme&limit=20&window=200')))
      .toMatchObject({ online: false, category: 'restaurant', brand: 'Acme', limit: 20, window: 200 });
    expect(parseFoodSearchOptions(new URLSearchParams())).toMatchObject({ online: true });
    expect(parseFoodSearchOptions(new URLSearchParams('category=garbage&limit=-20&window=100000&cursor=x')))
      .toMatchObject({ category: 'all', limit: 20, window: 1000, cursor: 'x' });
    expect(parseFoodSearchOptions(new URLSearchParams('limit=NaN&window=Infinity')))
      .toMatchObject({ limit: 20, window: 100 });
  });
});
