import { parseCustomFood } from './food';
export const customFoodFields = [
  ['name', 'Food name', 'text'], ['brand', 'Brand or restaurant (optional)', 'text'],
  ['servingLabel', 'Serving description', 'text'], ['calories', 'Calories (kcal)', 'number'],
  ['protein', 'Protein (g)', 'number'], ['carbs', 'Carbs (g)', 'number'], ['fat', 'Fat (g)', 'number'],
  ['servingGrams', 'Serving weight in grams (optional)', 'number'],
] as const;
export type CustomFoodDraft = Record<typeof customFoodFields[number][0], string>;
export function emptyCustomFood(name = ''): CustomFoodDraft {
  return { name, brand: '', servingLabel: '1 serving', calories: '', protein: '', carbs: '', fat: '', servingGrams: '' };
}
export function customFoodInput(draft: CustomFoodDraft) {
  return parseCustomFood({ name: draft.name, ...(draft.brand.trim() ? { brand: draft.brand } : {}), servingLabel: draft.servingLabel,
    calories: draft.calories.trim() ? Number(draft.calories) : undefined,
    protein: draft.protein.trim() ? Number(draft.protein) : undefined,
    carbs: draft.carbs.trim() ? Number(draft.carbs) : undefined,
    fat: draft.fat.trim() ? Number(draft.fat) : undefined,
    servingGrams: draft.servingGrams.trim() ? Number(draft.servingGrams) : null,
  });
}
