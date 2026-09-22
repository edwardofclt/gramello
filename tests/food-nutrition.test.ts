import { describe, expect, it } from 'vitest';
import { parseCustomFood, scaleFood } from '../lib/food';

describe('food portions', () => {
  const bowl = { calories: 600, protein: 30, carbs: 65, fat: 25, nutritionBasis: 'serving' as const, servingGrams: null };
  it('scales a restaurant serving without inventing a weight', () => {
    expect(scaleFood(bowl, .5, 'serving')).toEqual({ grams: null, calories: 300, protein: 15, carbs: 32.5, fat: 12.5 });
    expect(scaleFood(bowl, 100, 'grams')).toBeNull();
  });
  it('converts known serving weights without treating serving nutrition as per 100g', () => {
    expect(scaleFood({ ...bowl, servingGrams: 400 }, 200, 'grams')).toEqual({ grams: 200, calories: 300, protein: 15, carbs: 32.5, fat: 12.5 });
    expect(scaleFood({ calories: 380, protein: 14, carbs: 66, fat: 6, servingGrams: 40 }, 1.5, 'serving')).toEqual({ grams: 60, calories: 228, protein: 8.4, carbs: 39.6, fat: 3.5999999999999996 });
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid amount %s', quantity => {
    expect(scaleFood(bowl, quantity, 'serving')).toBeNull();
  });
});

describe('custom food validation', () => {
  const input = { name: ' My bowl ', servingLabel: ' 1 bowl ', calories: 605, protein: 30, carbs: 65, fat: 25 };
  it('keeps independently entered calorie totals and discards trust/ownership claims', () => {
    expect(parseCustomFood({ ...input, verified: true, source: 'USDA', userId: 'victim' })).toEqual({ name: 'My bowl', servingLabel: '1 bowl', calories: 605, protein: 30, carbs: 65, fat: 25, servingGrams: null });
  });
  it.each([{}, null, { ...input, name: ' ' }, { ...input, calories: '' }, { ...input, protein: null }, { ...input, carbs: -1 }, { ...input, fat: Infinity }, { ...input, servingGrams: 0 }])('rejects missing or invalid nutrition %j', value => {
    expect(() => parseCustomFood(value)).toThrow();
  });
  it('allows explicitly entered zero nutrition', () => {
    expect(parseCustomFood({ ...input, calories: 0, protein: 0, carbs: 0, fat: 0 }).calories).toBe(0);
  });
});
