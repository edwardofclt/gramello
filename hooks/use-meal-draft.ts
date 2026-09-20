import { useState } from 'react';
import { amountGrams, ingredientTotals, summarizeMeal, type CustomMeal, type Ingredient, type MealInput } from '../lib/meals';

export function useMealDraft(initial?: CustomMeal) {
  const [name, setName] = useState(initial?.name ?? '');
  const [ingredients, setIngredients] = useState<(Ingredient & { amountText?: string })[]>(initial?.ingredients ?? []);
  const [weight, setWeight] = useState(initial?.totalGrams?.toString() ?? '');
  const [weightUnit, setWeightUnit] = useState<'grams' | 'ounces'>('grams');
  const [portion, setPortion] = useState(initial?.servingGrams.toString() ?? '4');
  const [portionUnit, setPortionUnit] = useState<'servings' | 'grams' | 'ounces'>(initial ? 'grams' : 'servings');
  let input: MealInput | null = null;
  let summary: ReturnType<typeof summarizeMeal> | null = null;
  let estimatedGrams = 0;
  try {
    estimatedGrams = ingredientTotals(ingredients).grams;
    const totalGrams = weight.trim() ? amountGrams(Number(weight), weightUnit) : null;
    const batchGrams = totalGrams ?? estimatedGrams;
    const servingGrams = portionUnit === 'servings' ? batchGrams / Number(portion) : amountGrams(Number(portion), portionUnit);
    if (ingredients.length && Number(portion) > 0) {
      input = { name: name.trim(), ingredients: ingredients.map(({ food, quantity, unit }) => ({ food, quantity, unit })), totalGrams, servingGrams };
      summary = summarizeMeal(input);
    }
  } catch { input = null; }
  const valid = Boolean(input && summary && name.trim() && name.length <= 150 && ingredients.length <= 100 && Number.isFinite(Number(portion)));
  return { name, setName, ingredients, setIngredients, weight, setWeight, weightUnit, setWeightUnit, portion, setPortion, portionUnit, setPortionUnit, input, summary, estimatedGrams, valid };
}
