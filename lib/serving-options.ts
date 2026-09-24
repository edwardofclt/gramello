import type { Food, FoodServing } from './food';

export function foodServingOptions(food: Food): FoodServing[] {
  const volume = food.nutritionBasis === '100ml' || food.nutritionUnit === 'ml';
  if (food.nutritionBasis === 'serving' && (volume || !food.servingGrams)) return [];
  const options = (food.servingOptions ?? []).filter(option => {
    const amount = volume ? option.ml : option.grams;
    return !!option.id && !!option.label && amount !== undefined && Number.isFinite(amount) && amount > 0
      && (volume ? option.grams === undefined : option.ml === undefined);
  });
  if (!options.length) return [];
  // Adapters may supply alternatives without repeating their default portion.
  if (!options.some(option => option.label === food.servingLabel && (volume ? option.ml === food.servingMl : option.grams === food.servingGrams))) {
    const amount = volume ? food.servingMl : food.servingGrams;
    if (amount && !options.some(option => option.id === 'default')) options.unshift({ id: 'default', label: food.servingLabel, ...(volume ? { ml: amount } : { grams: amount }) });
  }
  return options.filter((option, index) => options.findIndex(other => other.id === option.id) === index);
}

export function selectedFoodServingId(food: Food): string {
  const volume = food.nutritionBasis === '100ml' || food.nutritionUnit === 'ml';
  return food.selectedServingId ?? foodServingOptions(food).find(option => option.label === food.servingLabel
    && (volume ? option.ml === food.servingMl : option.grams === food.servingGrams))?.id ?? 'default';
}

export function selectFoodServing(food: Food, servingId?: string): Food | null {
  if (servingId === undefined) return food;
  const options = foodServingOptions(food), option = options.find(value => value.id === servingId);
  if (!option) return null;
  // For a per-serving food, selecting a different known weight changes the
  // serving's nutrients too. Per-100g/mL foods keep their existing basis.
  const factor = food.nutritionBasis === 'serving' ? option.grams! / food.servingGrams! : 1;
  return { ...food, servingOptions: options, selectedServingId: option.id, servingLabel: option.label,
    servingGrams: option.grams ?? null, servingMl: option.ml,
    calories: food.calories * factor, protein: food.protein * factor, carbs: food.carbs * factor, fat: food.fat * factor };
}
