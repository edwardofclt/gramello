import { entryAmount, scaleFood, GRAMS_PER_OUNCE, ML_PER_FLUID_OUNCE, type Food, type Nutrition, type AmountUnit } from './food';
export { scaleFood, GRAMS_PER_OUNCE, ML_PER_FLUID_OUNCE };
export type { Food, Nutrition, AmountUnit };
export type Ingredient = { food: Food; quantity: number; unit: AmountUnit };
export type MealInput = { name: string; ingredients: Ingredient[]; totalGrams: number | null; servingGrams: number };
export type CustomMeal = MealInput & { id: string; updatedAt: string };
export const nutrientKeys = ['calories', 'protein', 'carbs', 'fat'] as const;
export const displayAmount = (value: number) => Number(value.toFixed(2)).toString();
export const amountGrams = (quantity: number, unit: 'serving' | 'grams' | 'ounces', servingGrams = 100) =>
  quantity * (unit === 'ounces' ? GRAMS_PER_OUNCE : unit === 'serving' ? servingGrams : 1);

export const foodUnits = (food: Pick<Food, 'nutritionUnit' | 'nutritionBasis' | 'servingGrams'>): AmountUnit[] => food.nutritionUnit === 'ml' || food.nutritionBasis === '100ml'
  ? ['serving', 'milliliters', 'fluid-ounces'] : food.nutritionBasis === 'serving' && !food.servingGrams ? ['serving'] : ['serving', 'grams', 'ounces'];
export const unitLabels: Record<AmountUnit, string> = { serving: 'Servings', grams: 'Grams', ounces: 'Ounces', milliliters: 'mL', 'fluid-ounces': 'US fl oz' };
export const amountLabels: Record<AmountUnit, string> = { serving: 'Servings', grams: 'Weight in grams', ounces: 'Weight in ounces', milliliters: 'Volume in mL', 'fluid-ounces': 'Volume in US fluid ounces' };
export const unitHint = (unit: AmountUnit) => ({ serving: 'servings', grams: 'g', ounces: 'oz by weight', milliliters: 'mL', 'fluid-ounces': 'US fl oz' })[unit];
export const servingQuantity = (food: Food, unit: AmountUnit) => unit === 'serving' ? 1
  : unit === 'milliliters' ? food.servingMl ?? 100 : unit === 'fluid-ounces' ? (food.servingMl ?? 100) / ML_PER_FLUID_OUNCE
  : unit === 'ounces' ? (food.servingGrams ?? 100) / GRAMS_PER_OUNCE : food.servingGrams ?? 100;
export const entryAmountLabel = entryAmount;

export function scaleNutrition(nutrition: Nutrition, factor: number): Nutrition {
  return { calories: nutrition.calories * factor, protein: nutrition.protein * factor, carbs: nutrition.carbs * factor, fat: nutrition.fat * factor };
}
export function ingredientTotals(ingredients: Ingredient[]) {
  return ingredients.reduce((sum, item) => {
    const scaled = scaleFood(item.food, item.quantity, item.unit);
    if (!scaled) throw new Error('Enter a valid amount for each ingredient.');
    return { grams: sum.grams + (scaled.grams ?? 0), calories: sum.calories + scaled.calories, protein: sum.protein + scaled.protein, carbs: sum.carbs + scaled.carbs, fat: sum.fat + scaled.fat };
  }, { grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });
}
export function summarizeMeal(meal: MealInput) {
  if (meal.totalGrams === null && meal.ingredients.some(item => scaleFood(item.food, item.quantity, item.unit)?.grams == null)) {
    throw new Error('Enter the finished batch weight when an ingredient has no known weight.');
  }
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
  return { id: `meal-${meal.id}`, name: meal.name, source: 'My meals', sourceKind: 'custom', verified: false, nutritionBasis: '100g', ...scaleNutrition(totals, 100 / totalGrams), servingGrams: meal.servingGrams,
    servingLabel: `${displayAmount(meal.servingGrams)} g / ${displayAmount(meal.servingGrams / GRAMS_PER_OUNCE)} oz` };
}
