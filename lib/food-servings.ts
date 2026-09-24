import type { Food } from './food';
import defaults from '../data/food-catalog/usda-serving-defaults.json';

const servings: Record<string, Pick<Food, 'servingGrams' | 'servingLabel' | 'servingOptions'>> = defaults.foods;

// Apply only to USDA SR Legacy records, whose IDs and nutrient basis are fixed.
// This also upgrades old bundled/downloaded catalogs without changing their
// nutrition or any portions already captured in diary/recipe snapshots.
export function preferredFoodServing<T extends Food>(food: T): T {
  const serving = servings[food.id];
  if (!serving || food.source !== 'USDA FoodData Central' || food.nutritionBasis !== '100g' || food.brand) return food;
  return { ...food, ...serving };
}
