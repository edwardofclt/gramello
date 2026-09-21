import { z } from 'zod';
import { summarizeMeal } from './meals';

const positive = z.number().finite().positive().max(1_000_000);
const nutrient = z.number().finite().nonnegative().max(100_000);
const food = z.object({
  id: z.string().min(1).max(200), name: z.string().trim().min(1).max(300),
  source: z.string().min(1).max(100), brand: z.string().max(300).optional(),
  servingGrams: z.number().finite().nonnegative().max(1_000_000).nullable(), servingLabel: z.string().max(200),
  nutritionBasis: z.enum(['100g', 'serving', '100ml']).optional(),
  nutritionUnit: z.enum(['g', 'ml']).optional(), servingMl: positive.optional(),
  calories: nutrient, protein: nutrient, carbs: nutrient, fat: nutrient,
}).refine(food => food.nutritionUnit === 'ml' || food.nutritionBasis === '100ml'
  ? (food.servingGrams === null || food.servingGrams === 0) && Boolean(food.servingMl) && food.nutritionBasis !== 'serving'
  : food.nutritionBasis === 'serving' ? food.servingGrams === null || (food.servingGrams ?? 0) > 0 : (food.servingGrams ?? 0) > 0);
export const mealInputSchema = z.object({
  name: z.string().trim().min(1).max(150),
  ingredients: z.array(z.object({ food, quantity: positive, unit: z.enum(['serving', 'grams', 'ounces', 'milliliters', 'fluid-ounces']) })).min(1).max(100),
  totalGrams: positive.nullable(), servingGrams: positive,
}).superRefine((meal, context) => {
  try {
    const summary = summarizeMeal(meal);
    if (summary.totalGrams > 1_000_000 || Object.values(summary.totals).some(value => !Number.isFinite(value) || value > 1_000_000_000)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'This batch is too large. Use smaller ingredient amounts.' });
    }
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter valid ingredient amounts and a positive portion and batch weight.' });
  }
});
