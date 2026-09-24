import { z } from 'zod';

export type Nutrition = { calories: number; protein: number; carbs: number; fat: number };
export type FoodServing = { id: string; label: string; grams?: number; ml?: number };
export type Food = Nutrition & {
  id: string; name: string; brand?: string; source: string; sourceUrl?: string;
  // Older saved meal ingredients omit provenance and use a per-100g default.
  sourceKind?: 'database' | 'restaurant' | 'custom'; verified?: boolean;
  nutritionBasis?: '100g' | 'serving' | '100ml'; servingGrams: number | null; servingLabel: string;
  nutritionUnit?: 'g' | 'ml'; servingMl?: number;
  servingOptions?: FoodServing[]; selectedServingId?: string;
  image?: string; checkedAt?: string;
};
export type FoodPortion = Nutrition & { grams: number | null };
export type AmountUnit = 'serving' | 'grams' | 'ounces' | 'milliliters' | 'fluid-ounces';
export const GRAMS_PER_OUNCE = 28.349523125;
export const ML_PER_FLUID_OUNCE = 29.5735295625;

const nutrient = z.number().finite().min(0).max(100_000);
export const servingIdSchema = z.string().min(1).max(100);
export const foodServingFields = {
  servingOptions: z.array(z.object({
    id: servingIdSchema, label: z.string().min(1).max(200),
    grams: z.number().finite().positive().max(1e6).optional(),
    ml: z.number().finite().positive().max(1e6).optional(),
  }).refine(portion => (portion.grams !== undefined) !== (portion.ml !== undefined))).max(100).optional(),
  selectedServingId: servingIdSchema.optional(),
};
const customFoodSchema = z.object({
  name: z.string().trim().min(1, 'Enter a food name.').max(200),
  brand: z.string().trim().max(120).optional(),
  servingLabel: z.string().trim().min(1, 'Describe one serving.').max(120),
  calories: nutrient, protein: nutrient, carbs: nutrient, fat: nutrient,
  servingGrams: z.number().finite().positive().max(100_000).nullable().optional().transform(value => value ?? null),
});
export type CustomFoodInput = z.infer<typeof customFoodSchema>;
export function parseCustomFood(value: unknown): CustomFoodInput { return customFoodSchema.parse(value); }

export function scaleFood(food: Pick<Food, keyof Nutrition | 'servingGrams' | 'nutritionBasis' | 'nutritionUnit' | 'servingMl'>, quantity: number, unit: AmountUnit): FoodPortion | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return null;
  const volume = food.nutritionBasis === '100ml' || food.nutritionUnit === 'ml';
  const weight = food.servingGrams && Number.isFinite(food.servingGrams) && food.servingGrams > 0 ? food.servingGrams : null;
  if (volume ? !['serving', 'milliliters', 'fluid-ounces'].includes(unit) : !['serving', 'grams', 'ounces'].includes(unit)) return null;
  if (!volume && unit !== 'serving' && !weight && food.nutritionBasis === 'serving') return null;
  const grams = volume ? null : unit === 'grams' ? quantity : unit === 'ounces' ? quantity * GRAMS_PER_OUNCE : weight === null ? null : weight * quantity;
  const factor = volume
    ? quantity * (unit === 'serving' ? food.servingMl ?? 100 : unit === 'fluid-ounces' ? ML_PER_FLUID_OUNCE : 1) / 100
    : food.nutritionBasis === 'serving' ? unit === 'serving' ? quantity : grams! / weight!
    : grams === null ? NaN : grams / 100;
  const portion = { grams, calories: food.calories * factor, protein: food.protein * factor, carbs: food.carbs * factor, fat: food.fat * factor };
  return Object.values(portion).every(value => value === null || (Number.isFinite(value) && value >= 0)) ? portion : null;
}

export function nutritionLabel(food: Pick<Food, 'nutritionBasis' | 'nutritionUnit' | 'servingLabel'>) {
  return food.nutritionBasis === 'serving' ? `per ${food.servingLabel}` : food.nutritionBasis === '100ml' || food.nutritionUnit === 'ml' ? 'per 100 mL' : 'per 100 g';
}
export function entryAmount(entry: { grams: number | null; quantity: number; unit: string; servingLabel?: string | null }) {
  const quantity = Number(entry.quantity.toFixed(2));
  if (entry.unit === 'serving' && entry.servingLabel) return quantity === 1 ? entry.servingLabel : `${quantity} × ${entry.servingLabel}`;
  if (entry.unit === 'milliliters') return `${Number(entry.quantity.toFixed(2))} mL`;
  if (entry.unit === 'fluid-ounces') return `${Number(entry.quantity.toFixed(2))} US fl oz`;
  if (entry.grams !== null && entry.grams !== undefined && entry.grams > 0) return `${Math.round(entry.grams)} g`;
  if (entry.grams === 0 && !entry.servingLabel) return `${quantity} serving${quantity === 1 ? '' : 's'}`;
  return `${entry.quantity} × ${entry.servingLabel || 'serving'}`;
}
