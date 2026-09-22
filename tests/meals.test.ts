import { describe, expect, it } from 'vitest';
import { mealFood, summarizeMeal, scaleFood, entryAmountLabel, type MealInput } from '../lib/meals';
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
  it('preserves per-serving restaurant nutrition in recipes with a measured batch weight', () => {
    const bowl = { ...food, calories: 600, protein: 30, carbs: 65, fat: 25, nutritionBasis: 'serving' as const, servingGrams: null, servingLabel: '1 bowl' };
    const recipe = { ...soup, ingredients: [{ food: bowl, quantity: .5, unit: 'serving' as const }], totalGrams: 200, servingGrams: 100 };
    const parsed = mealInputSchema.parse(recipe);
    expect(parsed.ingredients[0].food.nutritionBasis).toBe('serving');
    expect(summarizeMeal(parsed).portion).toEqual({ calories: 150, protein: 7.5, carbs: 16.25, fat: 6.25 });
    expect(mealInputSchema.safeParse({ ...recipe, totalGrams: null }).success).toBe(false);
    expect(scaleFood(bowl, 100, 'grams')).toBeNull();
    expect(scaleFood({ ...bowl, servingGrams: 200 }, 200 / 28.349523125, 'ounces')?.calories).toBeCloseTo(600);
    expect(mealFood({ ...parsed, id: 'restaurant-recipe', updatedAt: 'today' }).verified).toBe(false);
  });
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

describe('volume amounts and recipes', () => {
  const liquid = { ...food, id: 'milk', name: 'Milk', nutritionUnit: 'ml' as const, servingGrams: 0, servingMl: 250, servingLabel: '250 mL' };
  it('does not convert mass and volume without density', () => {
    expect(scaleFood(food, 10, 'milliliters')).toBeNull();
    expect(scaleFood(food, 1, 'fluid-ounces')).toBeNull();
    expect(scaleFood(liquid, 10, 'grams')).toBeNull();
    expect(scaleFood(liquid, 1, 'ounces')).toBeNull();
    expect(scaleFood(liquid, 0, 'milliliters')).toBeNull();
    expect(scaleFood(liquid, Infinity, 'serving')).toBeNull();
    expect(scaleFood({ ...liquid, calories: 0 }, 1, 'serving')).toMatchObject({ grams: null, calories: 0 });
  });
  it('preserves volume ingredients and requires measured recipe yield', () => {
    const recipe = { ...soup, ingredients: [...soup.ingredients, { food: liquid, quantity: 1, unit: 'serving' }] };
    const saved = mealInputSchema.parse(recipe);
    expect(saved.ingredients[2].food).toMatchObject({ nutritionUnit: 'ml', servingMl: 250 });
    expect(summarizeMeal(saved).totals.calories).toBe(1700);
    expect(mealInputSchema.safeParse({ ...recipe, totalGrams: null }).success).toBe(false);
    expect(mealInputSchema.safeParse({ ...recipe, ingredients: [{ food: liquid, quantity: 100, unit: 'grams' }] }).success).toBe(false);
    expect(mealInputSchema.safeParse({ ...recipe, ingredients: [{ food: liquid, quantity: 100, unit: 'milliliters' }] }).success).toBe(true);
  });
  it('displays saved volume amounts without inventing grams', () => {
    expect(entryAmountLabel({ quantity: .5, unit: 'serving', grams: 0 })).toBe('0.5 servings');
    expect(entryAmountLabel({ quantity: 250, unit: 'milliliters', grams: 0 })).toBe('250 mL');
    expect(entryAmountLabel({ quantity: 8, unit: 'fluid-ounces', grams: 0 })).toBe('8 US fl oz');
    expect(entryAmountLabel({ quantity: 1, unit: 'serving', grams: 40 })).toBe('40 g');
  });
});
