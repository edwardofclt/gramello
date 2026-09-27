import type { Food } from './food';
import { productFood, productFields, type Product } from './barcode-food';
import { foodSearchTerms, foodMatchesQuery, rankFoodSearch } from './search';
import { preferredFoodServing } from './food-servings';
import { FoodProviderError } from './food-search';

function number(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
const trusted = { sourceKind: 'database' as const, verified: true, nutritionBasis: '100g' as const };
export { referenceFoods } from './reference-foods';

export type ProviderFoodPage = { foods: Food[]; hasMore: boolean; rejectedCount: number };
export async function searchOpenFoodFactsPage(query: string, signal: AbortSignal, pageSize = 20): Promise<ProviderFoodPage> {
  const searchQuery = foodSearchTerms(query).join(' ');
  if (!searchQuery) return { foods: [], hasMore: false, rejectedCount: 0 };
  const fields = productFields;
  const params = new URLSearchParams({ search_terms:searchQuery, search_simple:'1', action:'process', json:'1', page_size:String(Math.max(1, Math.min(100, pageSize))), page:'1', fields });
  const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, { headers:{'User-Agent':'GramelloTracker/1.0 (personal food diary)'}, signal });
  if (!response.ok) throw new FoodProviderError(`Open Food Facts ${response.status}`, response.status);
  const data = await response.json() as { products?: Product[]; count?: number; page_size?: number };
  const foods = (data.products ?? []).flatMap(product => {
    if (!product.code) return [];
    const food = productFood(product, product.code);
    return food ? [food] : [];
  });
  return { foods: foods.filter(food => foodMatchesQuery(query, food)), hasMore: Number(data.count ?? 0) > (data.products?.length ?? 0), rejectedCount: (data.products?.length ?? 0) - foods.length };
}
export async function searchOpenFoodFacts(query: string, signal: AbortSignal): Promise<Food[]> {
  return rankFoodSearch(query, (await searchOpenFoodFactsPage(query, signal)).foods).foods;
}

export async function searchUsdaPage(query: string, signal: AbortSignal, apiKey?: string, pageSize = 20): Promise<ProviderFoodPage> {
  const searchQuery = foodSearchTerms(query).join(' ');
  if (!searchQuery) return { foods: [], hasMore: false, rejectedCount: 0 };
  if (!apiKey?.trim()) throw new FoodProviderError('USDA search requires a server API key.', 503);
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(searchQuery)}&pageSize=${Math.max(1, Math.min(200, pageSize))}`, { signal });
  if (!response.ok) throw new FoodProviderError(`USDA ${response.status}`, response.status);
  const data = await response.json() as { totalHits?: number; foods?: Array<{ fdcId?:number; description?:string; brandOwner?:string; servingSize?:unknown; servingSizeUnit?:string; householdServingFullText?:string; foodNutrients?:Array<{nutrientName?:string;unitName?:string;value?:unknown}> }> };
  const foods = (data.foods ?? []).flatMap(product => {
    const nutrients = product.foodNutrients ?? [];
    const nutrient = (name: string) => number(nutrients.find(n => n.nutrientName === name)?.value);
    const kcal = nutrients.find(n => n.nutrientName?.startsWith('Energy') && n.unitName?.toLowerCase() === 'kcal');
    const calories = number(kcal?.value), protein = nutrient('Protein'), carbs = nutrient('Carbohydrate, by difference'), fat = nutrient('Total lipid (fat)');
    if (!product.fdcId || !product.description || calories === null || protein === null || carbs === null || fat === null) return [];
    const weight = product.servingSizeUnit?.toLowerCase() === 'g' ? number(product.servingSize) : null;
    return [preferredFoodServing({ ...trusted, id:`usda-${product.fdcId}`, name:product.description.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()), brand:product.brandOwner,
      source:'USDA FoodData Central', sourceUrl:`https://fdc.nal.usda.gov/food-details/${product.fdcId}/nutrients`, calories, protein, carbs, fat,
      servingGrams:weight || 100, servingLabel:weight ? product.householdServingFullText || `${weight} g` : '100 g', checkedAt:new Date().toISOString() })];
  });
  return { foods: foods.filter(food => foodMatchesQuery(query, food)), hasMore: Number(data.totalHits ?? 0) > (data.foods?.length ?? 0), rejectedCount: (data.foods?.length ?? 0) - foods.length };
}
export async function searchUsda(query: string, signal: AbortSignal, apiKey?: string): Promise<Food[]> {
  return rankFoodSearch(query, (await searchUsdaPage(query, signal, apiKey)).foods).foods;
}
