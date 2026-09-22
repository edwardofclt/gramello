import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchOpenFoodFacts, searchUsda } from '../lib/food-providers';

afterEach(() => vi.unstubAllGlobals());
describe('verified database values', () => {
  it('keeps zero macros, skips missing macros, and recognizes volume nutrition without inventing grams', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ products: [
      { code: '123', product_name: 'Water', serving_size: '250 ml', product_quantity_unit: 'ml', nutriments: { 'energy-kcal_100g': 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 } },
      { code: '456', product_name: 'Incomplete', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 5, carbohydrates_100g: 20 } },
    ] }));
    const foods = await searchOpenFoodFacts('water', new AbortController().signal);
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({ calories: 0, protein: 0, carbs: 0, fat: 0, verified: true, sourceKind: 'database', nutritionBasis: '100ml', nutritionUnit: 'ml', servingMl: 250, servingLabel: '250 ml', servingGrams: null });
  });
  it('selects USDA kcal rather than kJ and does not treat milliliters as grams', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ foods: [{ fdcId: 42, description: 'Test milk', servingSize: 250, servingSizeUnit: 'ml', foodNutrients: [
      { nutrientName: 'Energy', unitName: 'kJ', value: 251 }, { nutrientName: 'Energy', unitName: 'KCAL', value: 60 },
      { nutrientName: 'Protein', unitName: 'G', value: 3 }, { nutrientName: 'Carbohydrate, by difference', unitName: 'G', value: 5 }, { nutrientName: 'Total lipid (fat)', unitName: 'G', value: 3 },
    ] }] }));
    const foods = await searchUsda('milk', new AbortController().signal);
    expect(foods[0]).toMatchObject({ calories: 60, servingGrams: 100, servingLabel: '100 g', verified: true, nutritionBasis: '100g' });
  });
});
