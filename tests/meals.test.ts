import { describe, expect, it } from 'vitest';
import { mealFood, summarizeMeal, scaleFood, type MealInput } from '../lib/meals';
import { mealInputSchema } from '../lib/meal-validation';

// Deliberately simple nutrition fixtures: 400 g at 200 kcal/100 g plus
// 200 g at 200 kcal/100 g = 1,200 kcal, regardless of cooked weight.
const food = { id: 'beef', name: 'Beef', source: 'Test', calories: 200, protein: 20, carbs: 10, fat: 5, servingGrams: 100, servingLabel: '100 g' };
const soup: MealInput = {
  name: 'Soup', ingredients: [
    { food, quantity: 4, unit: 'serving' },
    { food: { ...food, id: 'tomatoes', name: 'Tomatoes' }, quantity: 200, unit: 'grams' },
  ], totalGrams: 1814.36948, servingGrams: 453.59237,
};

describe('custom meal portions', () => {
  it('turns a 64 oz, 1200 kcal batch into four 16 oz, 300 kcal portions', () => {
    const summary = summarizeMeal(soup);
    expect(summary.totals).toEqual({ calories: 1200, protein: 120, carbs: 60, fat: 30 });
    expect(summary.ingredientGrams).toBe(600);
    expect(summary.servings).toBeCloseTo(4, 8);
    const saved = mealFood({ ...soup, id: 'soup', updatedAt: 'today' });
    expect(scaleFood(saved, 16, 'ounces')?.calories).toBeCloseTo(300, 8);
    expect(scaleFood(saved, 1, 'serving')?.protein).toBeCloseTo(30, 8);
    expect(scaleFood(saved, 8, 'ounces')?.fat).toBeCloseTo(3.75, 8);
    expect(scaleFood(saved, 226.796185, 'grams')?.carbs).toBeCloseTo(7.5, 8);
  });

  it('estimates yield from ingredient amounts until a finished weight is entered', () => {
    const estimated = summarizeMeal({ ...soup, totalGrams: null, servingGrams: 150 });
    expect(estimated.totalGrams).toBe(600);
    expect(estimated.servings).toBe(4);
    expect(estimated.portion.calories).toBe(300);
    const cooked = summarizeMeal({ ...soup, totalGrams: 300, servingGrams: 150 });
    expect(cooked.totals.calories).toBe(1200);
    expect(cooked.portion.calories).toBe(600);
  });

  it('scales fractional ingredient quantities without rounding away precision', () => {
    const result = summarizeMeal({ ...soup, ingredients: [{ food, quantity: .125, unit: 'serving' }], totalGrams: null, servingGrams: 6.25 });
    expect(result.totals.calories).toBe(25);
    expect(result.portion.protein).toBe(1.25);
    expect(scaleFood(food, 0, 'grams')).toBeNull();
    expect(scaleFood(food, Infinity, 'ounces')).toBeNull();
  });

  it.each([
    { name: '   ' }, { ingredients: [] }, { totalGrams: 0 }, { totalGrams: -10 },
    { servingGrams: 0 }, { servingGrams: Infinity },
    { totalGrams: Number.MIN_VALUE }, { servingGrams: Number.MIN_VALUE },
    { ingredients: [{ food, quantity: -1, unit: 'grams' }] },
    { ingredients: [{ food, quantity: 1, unit: 'cups' }] },
    { ingredients: [{ food: { ...food, protein: -1 }, quantity: 1, unit: 'serving' }] },
    { ingredients: [{ food: { ...food, servingGrams: 0 }, quantity: 1, unit: 'serving' }] },
  ])('rejects invalid meal data: %j', invalid => {
    expect(mealInputSchema.safeParse({ ...soup, ...invalid }).success).toBe(false);
  });
  it('accepts zero-calorie ingredients and strips client-supplied nutrition totals', () => {
    const input = mealInputSchema.parse({ ...soup, calories: 9999, userId: 'another-user', ingredients: [{ food: { ...food, calories: 0 }, quantity: 100, unit: 'grams' }] });
    expect(input).not.toHaveProperty('calories');
    expect(input).not.toHaveProperty('userId');
    expect(summarizeMeal(input).totals.calories).toBe(0);
  });
});
