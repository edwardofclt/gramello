/** Food nutrition is always per 100 g; amounts and cooked yield are mass, never fluid ounces. */
export type Nutrition = { calories: number; protein: number; carbs: number; fat: number };
export type Food = Nutrition & {
  id: string; name: string; brand?: string; source: string;
  servingGrams: number; servingLabel: string; image?: string;
};
export type AmountUnit = 'serving' | 'grams' | 'ounces';
export type Ingredient = { food: Food; quantity: number; unit: AmountUnit };
export type MealInput = { name: string; ingredients: Ingredient[]; totalGrams: number | null; servingGrams: number };
export type CustomMeal = MealInput & { id: string; updatedAt: string };
export const GRAMS_PER_OUNCE = 28.349523125;
export const nutrientKeys = ['calories', 'protein', 'carbs', 'fat'] as const;
export const displayAmount = (value: number) => Number(value.toFixed(2)).toString();
export const amountGrams = (quantity: number, unit: AmountUnit, servingGrams = 100) =>
  quantity * (unit === 'ounces' ? GRAMS_PER_OUNCE : unit === 'serving' ? servingGrams : 1);

export function scaleNutrition(nutrition: Nutrition, factor: number): Nutrition {
  return { calories: nutrition.calories * factor, protein: nutrition.protein * factor, carbs: nutrition.carbs * factor, fat: nutrition.fat * factor };
}
export function scaleFood(food: Pick<Food, keyof Nutrition | 'servingGrams'>, quantity: number, unit: AmountUnit) {
  const grams = amountGrams(quantity, unit, food.servingGrams);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  const scaled = scaleNutrition(food, grams / 100);
  if (nutrientKeys.some(key => !Number.isFinite(scaled[key]) || scaled[key] < 0)) return null;
  return { grams, ...scaled };
}
export function ingredientTotals(ingredients: Ingredient[]) {
  return ingredients.reduce((sum, item) => {
    const scaled = scaleFood(item.food, item.quantity, item.unit);
    if (!scaled) throw new Error('Enter a valid amount for each ingredient.');
    return { grams: sum.grams + scaled.grams, calories: sum.calories + scaled.calories, protein: sum.protein + scaled.protein, carbs: sum.carbs + scaled.carbs, fat: sum.fat + scaled.fat };
  }, { grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });
}
export function summarizeMeal(meal: MealInput) {
  const { grams: ingredientGrams, ...totals } = ingredientTotals(meal.ingredients);
  const totalGrams = meal.totalGrams ?? ingredientGrams;
  if (!Number.isFinite(totalGrams) || totalGrams <= 0 || !Number.isFinite(meal.servingGrams) || meal.servingGrams <= 0) throw new Error('Enter a batch weight and portion greater than zero.');
  const servings = totalGrams / meal.servingGrams;
  const portion = scaleNutrition(totals, meal.servingGrams / totalGrams);
  const per100 = scaleNutrition(totals, 100 / totalGrams);
  if (!Number.isFinite(servings) || [...Object.values(totals), ...Object.values(portion), ...Object.values(per100)].some(value => !Number.isFinite(value))) {
    throw new Error('These amounts are too large or too small to portion accurately.');
  }
  return { ingredientGrams, totalGrams, totals, servings, portion };
}
export function mealFood(meal: CustomMeal): Food {
  const { totalGrams, totals } = summarizeMeal(meal);
  return { id: `meal-${meal.id}`, name: meal.name, source: 'My meals', ...scaleNutrition(totals, 100 / totalGrams), servingGrams: meal.servingGrams,
    servingLabel: `${displayAmount(meal.servingGrams)} g / ${displayAmount(meal.servingGrams / GRAMS_PER_OUNCE)} oz` };
}
