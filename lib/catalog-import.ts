import { productFood, type Product } from './barcode-food';
import type { Food } from './food';
import { foodSchema } from '../mobile/src/local/records';

export type ImportedFood = Food & { barcodes: string[] };
export type UsdaBranded = {
  fdcId?: number; dataType?: string; description?: string; marketCountry?: string;
  gtinUpc?: string; brandName?: string; brandOwner?: string; discontinuedDate?: string;
  servingSize?: number; servingSizeUnit?: string; householdServingFullText?: string;
  publicationDate?: string; modifiedDate?: string;
  foodNutrients?: { nutrient?: { id?: number; unitName?: string }; amount?: unknown }[];
};
export type OffProduct = Product & {
  countries_tags?: string[]; obsolete?: boolean | number | string;
  no_nutrition_data?: boolean | string; last_modified_t?: number;
  data_quality_errors_tags?: string[];
};

export function canonicalGtin(value: unknown): string | null {
  if (typeof value !== 'string' || !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value) || /^0+$/.test(value)) return null;
  let sum = 0;
  for (let i = value.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(value[i]) * weight;
  return (10 - sum % 10) % 10 === Number(value.at(-1)) ? value.padStart(14, '0') : null;
}
function number(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function validated(food: Food, barcode: string): ImportedFood | null {
  if (food.calories > 1000 || [food.protein, food.carbs, food.fat].some(value => value > 100)) return null;
  const parsed = foodSchema.safeParse(food);
  return parsed.success ? { ...parsed.data, barcodes: [barcode] } : null;
}
export function normalizeUsdaBranded(raw: UsdaBranded): ImportedFood | null {
  const barcode = canonicalGtin(raw.gtinUpc);
  if (raw.dataType !== 'Branded' || raw.marketCountry !== 'United States' || raw.discontinuedDate
    || !Number.isSafeInteger(raw.fdcId) || raw.fdcId! <= 0 || !raw.description?.trim() || !barcode) return null;
  const find = (id: number, unit: string) => number(raw.foodNutrients?.find(row => row.nutrient?.id === id && row.nutrient?.unitName?.toLowerCase() === unit)?.amount);
  const calories = find(1008, 'kcal'), protein = find(1003, 'g'), carbs = find(1005, 'g'), fat = find(1004, 'g');
  if (calories === null || protein === null || carbs === null || fat === null) return null;
  const unit = raw.servingSizeUnit?.toLowerCase(), amount = number(raw.servingSize);
  // USDA branded label-derived values follow the serving unit (g or mL).
  // Unknown units are omitted rather than guessing a density or weight.
  if (unit !== 'g' && unit !== 'ml') return null;
  const serving = amount && amount <= 1e6 ? amount : 100;
  const label = amount ? `${raw.householdServingFullText?.trim() || '1 serving'} (${serving} ${unit === 'ml' ? 'mL' : 'g'})` : `100 ${unit === 'ml' ? 'mL' : 'g'}`;
  return validated({ id: `usda-${raw.fdcId}`, name: raw.description.trim(), brand: raw.brandName?.trim() || raw.brandOwner?.trim() || undefined,
    source: 'USDA FoodData Central', sourceKind: 'database', sourceDataset: 'usda-branded', verified: true,
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${raw.fdcId}/nutrients`,
    nutritionBasis: unit === 'ml' ? '100ml' : '100g', servingGrams: unit === 'g' ? serving : null,
    ...(unit === 'ml' ? { nutritionUnit: 'ml' as const, servingMl: serving } : {}),
    servingLabel: label, calories, protein, carbs, fat,
    checkedAt: raw.publicationDate || raw.modifiedDate,
  }, barcode);
}
export function normalizeOffProduct(raw: OffProduct): ImportedFood | null {
  const barcode = canonicalGtin(raw.code);
  if (!barcode || !raw.countries_tags?.includes('en:united-states') || [true, 1, '1'].includes(raw.obsolete ?? false)
    || raw.no_nutrition_data === true || raw.no_nutrition_data === 'on' || raw.data_quality_errors_tags?.length) return null;
  const weight = raw.serving_size?.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  const product = !number(raw.serving_quantity) && weight
    ? { ...raw, serving_quantity: Number(weight[1].replace(',', '.')), serving_quantity_unit: 'g' } : raw;
  const food = productFood(product, raw.code!);
  if (!food) return null;
  // Reproducible builds use the source timestamp, never the importer's wall clock.
  delete food.image;
  food.checkedAt = Number.isFinite(raw.last_modified_t) && raw.last_modified_t! > 0
    ? new Date(raw.last_modified_t! * 1000).toISOString() : undefined;
  return validated(food, barcode);
}
