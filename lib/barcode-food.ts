import { normalizeBarcode, type BarcodeFood } from './barcode';

type LookupResult = { status: 200; food: BarcodeFood } | { status: 400 | 404 | 422 | 503; error: string };
type Product = {
  code?: string; product_name?: string; brands?: string;
  nutriments?: Record<string, unknown>; nutrition_data_per?: string;
  serving_quantity?: unknown; serving_quantity_unit?: string; serving_size?: string;
  product_quantity_unit?: string; quantity?: string;
  image_front_small_url?: string;
};

function nutrient(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function lookupBarcode(input: string, signal?: AbortSignal): Promise<LookupResult> {
  const code = normalizeBarcode(input);
  if (!code) return { status: 400, error: 'Enter an 8, 12, 13, or 14 digit product barcode.' };
  try {
    const fields = 'code,product_name,brands,nutriments,nutrition_data_per,serving_quantity,serving_quantity_unit,serving_size,product_quantity_unit,quantity,image_front_small_url';
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=${fields}`, {
      headers: { 'User-Agent': 'NourishTracker/1.0 (personal food diary)', Accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return { status: 404, error: 'No product found for this barcode. Try another barcode or search by name.' };
    if (!response.ok) throw new Error(`Open Food Facts ${response.status}`);
    const data = await response.json() as { status?: number; product?: Product };
    if (data.status === 0) return { status: 404, error: 'No product found for this barcode. Try another barcode or search by name.' };
    if (data.status !== 1 || !data.product) throw new Error('Invalid product response');
    const product = data.product;
    const nutrients = product.nutriments ?? {};
    const kj = nutrient(nutrients['energy-kj_100g']) ?? nutrient(nutrients.energy_100g);
    const calories = nutrient(nutrients['energy-kcal_100g']) ?? (kj === null ? null : kj / 4.184);
    const protein = nutrient(nutrients.proteins_100g);
    const carbs = nutrient(nutrients.carbohydrates_100g);
    const fat = nutrient(nutrients.fat_100g);
    if (!product.product_name?.trim() || calories === null || protein === null || carbs === null || fat === null) {
      return { status: 422, error: 'This product is missing nutrition information. Search by name to find another listing.' };
    }
    // The diary scales by weight. OFF also uses *_100g keys for volume-based
    // labels; those cannot be converted to grams without a known density.
    const volumeLabel = [product.nutrition_data_per, product.serving_quantity_unit, product.serving_size, product.product_quantity_unit, product.quantity].join(' ');
    if (/(?:^|[\d\s(])(?:ml|cl|dl|l|fl\.?\s*oz|fluid ounces?)(?=$|[\s)])/i.test(volumeLabel)) {
      return { status: 422, error: 'This product lists nutrition by volume. Search by name for a listing with nutrition by weight.' };
    }
    const serving = nutrient(product.serving_quantity);
    const hasServingWeight = product.serving_quantity_unit === 'g' || (!product.serving_quantity_unit && /\d\s*g\b/i.test(product.serving_size ?? ''));
    const servingGrams = serving && hasServingWeight ? serving : 100;
    return { status: 200, food: {
      id: `off-${product.code || code}`, name: product.product_name.trim(),
      brand: product.brands?.split(',')[0]?.trim() || undefined, source: 'Open Food Facts', sourceKind: 'database', verified: true, nutritionBasis: '100g', sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(product.code || code)}`, checkedAt: new Date().toISOString(),
      calories, protein, carbs, fat, servingGrams,
      servingLabel: serving && hasServingWeight ? product.serving_size || `${servingGrams} g` : '100 g',
      image: product.image_front_small_url?.startsWith('https://') ? product.image_front_small_url : undefined,
    } };
  } catch {
    return { status: 503, error: 'Barcode lookup is unavailable right now. Try again or search by name.' };
  }
}
