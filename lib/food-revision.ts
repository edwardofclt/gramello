import type { Food } from './food';

// Optimistic review check, not a credential. Canonical data still supplies every
// logged nutrient. Ignore retrieval dates/images that do not change the portion.
export function foodRevision(food: Food): string {
  const value = JSON.stringify([
    food.id, food.name, food.brand ?? '', food.source, food.sourceUrl ?? '', food.verified ?? false,
    food.nutritionBasis ?? (food.nutritionUnit === 'ml' ? '100ml' : '100g'),
    food.servingGrams, food.servingMl ?? null, food.servingLabel,
    food.calories, food.protein, food.carbs, food.fat,
  ]);
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `1-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export function validateReviewedFood(food: Food, revision?: string): void {
  if (revision !== undefined && revision !== foodRevision(food)) {
    throw new RangeError('This food changed after you selected it. Return to results and review the updated food before adding it.');
  }
}
