import { z } from 'zod';
import { summarizeMeal } from './meals';

const positive = z.number().finite().positive().max(1_000_000);
const nutrient = z.number().finite().nonnegative().max(100_000);
const food = z.object({
  id: z.string().min(1).max(200), name: z.string().trim().min(1).max(300),
  source: z.string().min(1).max(100), brand: z.string().max(300).optional(),
  servingGrams: positive, servingLabel: z.string().max(200),
  calories: nutrient, protein: nutrient, carbs: nutrient, fat: nutrient,
});
export const mealInputSchema = z.object({
  name: z.string().trim().min(1).max(150),
  ingredients: z.array(z.object({ food, quantity: positive, unit: z.enum(['serving', 'grams', 'ounces']) })).min(1).max(100),
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
