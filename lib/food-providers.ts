import type { Food } from './food';

function number(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
const trusted = { sourceKind: 'database' as const, verified: true, nutritionBasis: '100g' as const };
export const referenceFoods: Food[] = [
  { id:'usda-171477',name:'Chicken breast, meat only, roasted',calories:165,protein:31.02,carbs:0,fat:3.57,servingGrams:100,servingLabel:'100 g' },
  { id:'usda-168878',name:'White rice, long-grain, enriched, cooked',calories:130,protein:2.69,carbs:28.17,fat:.28,servingGrams:100,servingLabel:'100 g' },
  { id:'usda-171287',name:'Large egg, whole, raw',calories:143,protein:12.56,carbs:.72,fat:9.51,servingGrams:50,servingLabel:'1 large (50 g)' },
  { id:'usda-173944',name:'Banana, raw',calories:89,protein:1.09,carbs:22.84,fat:.33,servingGrams:100,servingLabel:'100 g' },
  { id:'usda-173904',name:'Rolled oats, regular or quick, dry, not fortified',calories:379,protein:13.15,carbs:67.7,fat:6.52,servingGrams:100,servingLabel:'100 g' },
].map(food => ({ ...food, ...trusted, source:'USDA FoodData Central', sourceUrl:`https://fdc.nal.usda.gov/food-details/${food.id.slice(5)}/nutrients`, checkedAt:'2026-09-20' }));

export async function searchOpenFoodFacts(query: string, signal: AbortSignal): Promise<Food[]> {
  const fields = 'code,product_name,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,product_quantity_unit,quantity,image_front_small_url';
  const params = new URLSearchParams({ search_terms:query, search_simple:'1', action:'process', json:'1', page_size:'20', fields });
  const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, { headers:{'User-Agent':'NourishTracker/1.0 (personal food diary)'}, signal });
  if (!response.ok) throw new Error(`Open Food Facts ${response.status}`);
  const data = await response.json() as { products?: Array<{ code?:string; product_name?:string; brands?:string; nutriments?:Record<string,unknown>; serving_quantity?:unknown; serving_size?:string; serving_quantity_unit?:string; nutrition_data_per?:string; product_quantity_unit?:string; quantity?:string; image_front_small_url?:string }> };
  return (data.products ?? []).flatMap(product => {
    const nutrients = product.nutriments ?? {};
    const kj = number(nutrients['energy-kj_100g']) ?? number(nutrients.energy_100g);
    const calories = number(nutrients['energy-kcal_100g']) ?? (kj === null ? null : kj / 4.184);
    const protein = number(nutrients.proteins_100g), carbs = number(nutrients.carbohydrates_100g), fat = number(nutrients.fat_100g);
    if (!product.code || !product.product_name?.trim() || calories === null || protein === null || carbs === null || fat === null) return [];
    const volume = /(?:^|[\d\s(])(?:ml|cl|dl|l|fl\.?\s*oz|fluid ounces?)(?=$|[\s)])/i.test([product.nutrition_data_per,product.serving_quantity_unit,product.serving_size,product.product_quantity_unit,product.quantity].join(' '));
    const weight = (product.serving_quantity_unit === 'g' || /\d\s*g\b/i.test(product.serving_size ?? '')) ? number(product.serving_quantity) : null;
    return [{ ...trusted, id:`off-${product.code}`, name:product.product_name.trim(), brand:product.brands?.split(',')[0]?.trim(), source:'Open Food Facts',
      sourceUrl:`https://world.openfoodfacts.org/product/${encodeURIComponent(product.code)}`, calories, protein, carbs, fat,
      nutritionBasis: volume ? 'serving' as const : '100g' as const, servingGrams:volume ? null : weight || 100,
      servingLabel:volume ? '100 ml' : weight ? product.serving_size || `${weight} g` : '100 g',
      image:product.image_front_small_url?.startsWith('https://') ? product.image_front_small_url : undefined, checkedAt:new Date().toISOString() }];
  });
}

export async function searchUsda(query: string, signal: AbortSignal): Promise<Food[]> {
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(query)}&pageSize=20`, { signal });
  if (!response.ok) throw new Error(`USDA ${response.status}`);
  const data = await response.json() as { foods?: Array<{ fdcId?:number; description?:string; brandOwner?:string; servingSize?:unknown; servingSizeUnit?:string; householdServingFullText?:string; foodNutrients?:Array<{nutrientName?:string;unitName?:string;value?:unknown}> }> };
  return (data.foods ?? []).flatMap(product => {
    const nutrients = product.foodNutrients ?? [];
    const nutrient = (name: string) => number(nutrients.find(n => n.nutrientName === name)?.value);
    const kcal = nutrients.find(n => n.nutrientName?.startsWith('Energy') && n.unitName?.toLowerCase() === 'kcal');
    const calories = number(kcal?.value), protein = nutrient('Protein'), carbs = nutrient('Carbohydrate, by difference'), fat = nutrient('Total lipid (fat)');
    if (!product.fdcId || !product.description || calories === null || protein === null || carbs === null || fat === null) return [];
    const weight = product.servingSizeUnit?.toLowerCase() === 'g' ? number(product.servingSize) : null;
    return [{ ...trusted, id:`usda-${product.fdcId}`, name:product.description.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()), brand:product.brandOwner,
      source:'USDA FoodData Central', sourceUrl:`https://fdc.nal.usda.gov/food-details/${product.fdcId}/nutrients`, calories, protein, carbs, fat,
      servingGrams:weight || 100, servingLabel:weight ? product.householdServingFullText || `${weight} g` : '100 g', checkedAt:new Date().toISOString() }];
  });
}
