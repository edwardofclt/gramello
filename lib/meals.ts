/** Nutrition is per 100 g by default, or per 100 mL when nutritionUnit is ml. */
export type Nutrition = { calories: number; protein: number; carbs: number; fat: number };
export type Food = Nutrition & {
  id: string; name: string; brand?: string; source: string;
  servingGrams: number; servingLabel: string; image?: string;
  nutritionUnit?: 'g' | 'ml'; servingMl?: number;
};
export type AmountUnit = 'serving' | 'grams' | 'ounces' | 'milliliters' | 'fluid-ounces';
export type Ingredient = { food: Food; quantity: number; unit: AmountUnit };
export type MealInput = { name: string; ingredients: Ingredient[]; totalGrams: number | null; servingGrams: number };
export type CustomMeal = MealInput & { id: string; updatedAt: string };
export const GRAMS_PER_OUNCE = 28.349523125;
export const ML_PER_FLUID_OUNCE = 29.5735295625; // US fluid ounce
export const nutrientKeys = ['calories', 'protein', 'carbs', 'fat'] as const;
export const displayAmount = (value: number) => Number(value.toFixed(2)).toString();
export const amountGrams = (quantity: number, unit: 'serving' | 'grams' | 'ounces', servingGrams = 100) =>
  quantity * (unit === 'ounces' ? GRAMS_PER_OUNCE : unit === 'serving' ? servingGrams : 1);

export const foodUnits = (food: Pick<Food, 'nutritionUnit'>): AmountUnit[] => food.nutritionUnit === 'ml'
  ? ['serving', 'milliliters', 'fluid-ounces'] : ['serving', 'grams', 'ounces'];
export const unitLabels: Record<AmountUnit, string> = { serving: 'Servings', grams: 'Grams', ounces: 'Ounces', milliliters: 'mL', 'fluid-ounces': 'US fl oz' };
export const amountLabels: Record<AmountUnit, string> = { serving: 'Servings', grams: 'Weight in grams', ounces: 'Weight in ounces', milliliters: 'Volume in mL', 'fluid-ounces': 'Volume in US fluid ounces' };
export const unitHint = (unit: AmountUnit) => ({ serving: 'servings', grams: 'g', ounces: 'oz by weight', milliliters: 'mL', 'fluid-ounces': 'US fl oz' })[unit];
export const servingQuantity = (food: Food, unit: AmountUnit) => unit === 'serving' ? 1
  : unit === 'milliliters' ? food.servingMl ?? 100 : unit === 'fluid-ounces' ? (food.servingMl ?? 100) / ML_PER_FLUID_OUNCE
  : unit === 'ounces' ? food.servingGrams / GRAMS_PER_OUNCE : food.servingGrams;
export function entryAmountLabel(entry: { grams: number; quantity: number; unit: string }) {
  if (entry.unit === 'milliliters') return `${displayAmount(entry.quantity)} mL`;
  if (entry.unit === 'fluid-ounces') return `${displayAmount(entry.quantity)} US fl oz`;
  if (entry.grams === 0) return `${displayAmount(entry.quantity)} serving${entry.quantity === 1 ? '' : 's'}`;
  return `${Math.round(entry.grams)} g`;
}

export function scaleNutrition(nutrition: Nutrition, factor: number): Nutrition {
  return { calories: nutrition.calories * factor, protein: nutrition.protein * factor, carbs: nutrition.carbs * factor, fat: nutrition.fat * factor };
}
export function scaleFood(food: Pick<Food, keyof Nutrition | 'servingGrams' | 'nutritionUnit' | 'servingMl'>, quantity: number, unit: AmountUnit) {
  if (!foodUnits(food).includes(unit)) return null;
  const volume = food.nutritionUnit === 'ml';
  const amount = volume
    ? quantity * (unit === 'serving' ? food.servingMl ?? 100 : unit === 'fluid-ounces' ? ML_PER_FLUID_OUNCE : 1)
    : amountGrams(quantity, unit as 'serving' | 'grams' | 'ounces', food.servingGrams);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const scaled = scaleNutrition(food, amount / 100);
  if (nutrientKeys.some(key => !Number.isFinite(scaled[key]) || scaled[key] < 0)) return null;
  // The existing diary stores mass as a number. Zero marks unknown mass for
  // volume entries; their quantity/unit and nutrient totals remain authoritative.
  return { grams: volume ? 0 : amount, ...scaled };
}
export function ingredientTotals(ingredients: Ingredient[]) {
  return ingredients.reduce((sum, item) => {
    const scaled = scaleFood(item.food, item.quantity, item.unit);
    if (!scaled) throw new Error('Enter a valid amount for each ingredient.');
    return { grams: sum.grams + scaled.grams, calories: sum.calories + scaled.calories, protein: sum.protein + scaled.protein, carbs: sum.carbs + scaled.carbs, fat: sum.fat + scaled.fat };
  }, { grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });
}
export function summarizeMeal(meal: MealInput) {
  if (meal.totalGrams === null && meal.ingredients.some(item => item.food.nutritionUnit === 'ml')) {
    throw new Error('Enter the finished batch weight for meals with volume-based ingredients.');
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
  return { id: `meal-${meal.id}`, name: meal.name, source: 'My meals', ...scaleNutrition(totals, 100 / totalGrams), servingGrams: meal.servingGrams,
    servingLabel: `${displayAmount(meal.servingGrams)} g / ${displayAmount(meal.servingGrams / GRAMS_PER_OUNCE)} oz` };
}
