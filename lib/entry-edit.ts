import { z } from 'zod';
import { GRAMS_PER_OUNCE, ML_PER_FLUID_OUNCE, type AmountUnit, type FoodPortion } from './food';

export const entryMeals = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;
export const entryEditSchema = z.object({
  meal: z.enum(entryMeals),
  quantity: z.number().finite().positive().max(1_000_000),
  unit: z.enum(['serving', 'grams', 'ounces', 'milliliters', 'fluid-ounces']),
});
export type EntryEdit = z.infer<typeof entryEditSchema>;
export type EntrySnapshot = FoodPortion & { quantity: number; unit: string };

// Historical entries do not always retain the original serving size or volume.
// Offer only conversions supported by the saved snapshot, without a catalog lookup.
export function entryUnits(entry: EntrySnapshot): AmountUnit[] {
  if (entry.unit === 'milliliters' || entry.unit === 'fluid-ounces') return ['milliliters', 'fluid-ounces'];
  if (entry.unit === 'grams' || entry.unit === 'ounces') return ['grams', 'ounces'];
  return entry.grams !== null && entry.grams > 0 ? ['serving', 'grams', 'ounces'] : ['serving'];
}

export function editedPortion(entry: EntrySnapshot, quantity: number, unit: AmountUnit): FoodPortion | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000 || !Number.isFinite(entry.quantity) || entry.quantity <= 0 || !entryUnits(entry).includes(unit)) return null;
  const factor = unit === entry.unit ? quantity / entry.quantity
    : unit === 'milliliters' || unit === 'fluid-ounces'
      ? quantity * (unit === 'fluid-ounces' ? ML_PER_FLUID_OUNCE : 1) / (entry.quantity * (entry.unit === 'fluid-ounces' ? ML_PER_FLUID_OUNCE : 1))
      : quantity * (unit === 'ounces' ? GRAMS_PER_OUNCE : 1) / (entry.grams ?? 0);
  const portion = { grams: entry.grams === null ? null : entry.grams * factor,
    calories: entry.calories * factor, protein: entry.protein * factor, carbs: entry.carbs * factor, fat: entry.fat * factor };
  return Object.values(portion).every(value => value === null || (Number.isFinite(value) && value >= 0 && value <= 1e12)) ? portion : null;
}
