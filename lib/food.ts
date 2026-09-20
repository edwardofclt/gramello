import { z } from 'zod';

export type Nutrition = { calories: number; protein: number; carbs: number; fat: number };
export type Food = Nutrition & {
  id: string; name: string; brand?: string; source: string; sourceUrl?: string;
  sourceKind: 'database' | 'restaurant' | 'custom'; verified: boolean;
  nutritionBasis: '100g' | 'serving'; servingGrams: number | null; servingLabel: string;
  image?: string; checkedAt?: string;
};
export type FoodPortion = Nutrition & { grams: number | null };

const nutrient = z.number().finite().min(0).max(100_000);
const customFoodSchema = z.object({
  name: z.string().trim().min(1, 'Enter a food name.').max(200),
  brand: z.string().trim().max(120).optional(),
  servingLabel: z.string().trim().min(1, 'Describe one serving.').max(120),
  calories: nutrient, protein: nutrient, carbs: nutrient, fat: nutrient,
  servingGrams: z.number().finite().positive().max(100_000).nullable().optional().transform(value => value ?? null),
});
export type CustomFoodInput = z.infer<typeof customFoodSchema>;
export function parseCustomFood(value: unknown): CustomFoodInput { return customFoodSchema.parse(value); }

export function scaleFood(food: Nutrition & { servingGrams: number | null; nutritionBasis?: '100g' | 'serving' }, quantity: number, unit: 'serving' | 'grams'): FoodPortion | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100_000) return null;
  const weight = food.servingGrams && Number.isFinite(food.servingGrams) && food.servingGrams > 0 ? food.servingGrams : null;
  if (unit === 'grams' && !weight && food.nutritionBasis === 'serving') return null;
  const grams = unit === 'grams' ? quantity : weight === null ? null : weight * quantity;
  const factor = food.nutritionBasis === 'serving'
    ? unit === 'grams' ? quantity / weight! : quantity
    : grams === null ? NaN : grams / 100;
  const portion = { grams, calories: food.calories * factor, protein: food.protein * factor, carbs: food.carbs * factor, fat: food.fat * factor };
  return Object.values(portion).every(value => value === null || (Number.isFinite(value) && value >= 0)) ? portion : null;
}

export function nutritionLabel(food: Pick<Food, 'nutritionBasis' | 'servingLabel'>) {
  return food.nutritionBasis === 'serving' ? `per ${food.servingLabel}` : 'per 100 g';
}
export function entryAmount(entry: { grams: number | null; quantity: number; unit: string; servingLabel?: string | null }) {
  if (entry.grams !== null && entry.grams !== undefined) return `${Math.round(entry.grams)} g`;
  return `${entry.quantity} × ${entry.servingLabel || 'serving'}`;
}
