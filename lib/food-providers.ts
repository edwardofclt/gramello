import type { Food } from './food';
import { productFood, productFields, type Product } from './barcode-food';
import { FoodProviderError } from './food-search';
import { foodSearchTerms, rankFoodSearch } from './food-search-ranking';
import { preferredFoodServing } from './food-servings';

function number(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
const trusted = { sourceKind: 'database' as const, verified: true, nutritionBasis: '100g' as const };
export { referenceFoods } from './reference-foods';

export async function searchOpenFoodFacts(query: string, signal: AbortSignal): Promise<Food[]> {
  const searchQuery = foodSearchTerms(query).join(' ');
  if (!searchQuery) return [];
  const fields = productFields;
  const params = new URLSearchParams({ search_terms:searchQuery, search_simple:'1', action:'process', json:'1', page_size:'20', fields });
  const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, { headers:{'User-Agent':'GramelloTracker/1.0 (personal food diary)'}, signal });
  if (!response.ok) throw new FoodProviderError(`Open Food Facts ${response.status}`, response.status);
  const data = await response.json() as { products?: Product[] };
  return rankFoodSearch((data.products ?? []).flatMap(product => {
    if (!product.code) return [];
    const food = productFood(product, product.code);
    return food ? [food] : [];
  }), query);
}

export async function searchUsda(query: string, signal: AbortSignal): Promise<Food[]> {
  const searchQuery = foodSearchTerms(query).join(' ');
  if (!searchQuery) return [];
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(searchQuery)}&pageSize=20`, { signal });
  if (!response.ok) throw new FoodProviderError(`USDA ${response.status}`, response.status);
  const data = await response.json() as { foods?: Array<{ fdcId?:number; description?:string; brandOwner?:string; servingSize?:unknown; servingSizeUnit?:string; householdServingFullText?:string; foodNutrients?:Array<{nutrientName?:string;unitName?:string;value?:unknown}> }> };
  return rankFoodSearch((data.foods ?? []).flatMap(product => {
    const nutrients = product.foodNutrients ?? [];
    const nutrient = (name: string) => number(nutrients.find(n => n.nutrientName === name)?.value);
    const kcal = nutrients.find(n => n.nutrientName?.startsWith('Energy') && n.unitName?.toLowerCase() === 'kcal');
    const calories = number(kcal?.value), protein = nutrient('Protein'), carbs = nutrient('Carbohydrate, by difference'), fat = nutrient('Total lipid (fat)');
    if (!product.fdcId || !product.description || calories === null || protein === null || carbs === null || fat === null) return [];
    const weight = product.servingSizeUnit?.toLowerCase() === 'g' ? number(product.servingSize) : null;
    return [preferredFoodServing({ ...trusted, id:`usda-${product.fdcId}`, name:product.description.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()), brand:product.brandOwner,
      source:'USDA FoodData Central', sourceUrl:`https://fdc.nal.usda.gov/food-details/${product.fdcId}/nutrients`, calories, protein, carbs, fat,
      servingGrams:weight || 100, servingLabel:weight ? product.householdServingFullText || `${weight} g` : '100 g', checkedAt:new Date().toISOString() })];
  }), query);
}
