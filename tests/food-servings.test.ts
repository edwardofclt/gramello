import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { Food } from '../lib/food';
import { scaleFood } from '../lib/food';
import { preferredFoodServing } from '../lib/food-servings';
import { referenceFoods } from '../lib/reference-foods';
import { foodServingOptions, selectedFoodServingId, selectFoodServing } from '../lib/serving-options';
import { ingredientTotals } from '../lib/meals';
import { mealInputSchema } from '../lib/meal-validation';
import { createCatalogReader } from '../mobile/src/catalog/queries';
import { createLocalRepository } from '../mobile/src/local/repository';
import { testDatabase } from './helpers/local-sqlite';

const egg: Food = {
  id: 'usda-171287', name: 'Egg, whole, raw, fresh', source: 'USDA FoodData Central',
  sourceKind: 'database', nutritionBasis: '100g', servingGrams: 243,
  servingLabel: '1 cup (4.86 large eggs) (243 g)', calories: 143, protein: 12.56, carbs: .72, fat: 9.51,
};

describe('practical food servings', () => {
  it('uses one large egg and scales two eggs to 100 g without changing per-100g nutrition', () => {
    const preferred = preferredFoodServing(egg);
    expect(preferred).toMatchObject({ ...egg, servingGrams: 50, servingLabel: '1 large (50 g)' });
    expect(scaleFood(preferred, 2, 'serving')).toEqual({ grams: 100, calories: 143, protein: 12.56, carbs: .72, fat: 9.51 });
    expect(referenceFoods.find(food => food.id === egg.id)).toMatchObject({ servingGrams: 50, servingLabel: '1 large (50 g)' });
    expect(egg.servingGrams).toBe(243);
  });

  it('does not override custom, packaged, restaurant, or per-serving nutrition records', () => {
    for (const food of [
      { ...egg, id: 'custom-egg', source: 'My foods' },
      { ...egg, id: 'off-123', source: 'Open Food Facts' },
      { ...egg, id: 'restaurant-eggs', source: 'Official restaurant nutrition' },
      { ...egg, nutritionBasis: 'serving' as const },
      { ...egg, brand: 'A packaged brand' },
    ]) expect(preferredFoodServing(food)).toBe(food);
  });

  it('upgrades installed/bundled catalog reads, preserves existing logs, and keeps new portions consistent', async () => {
    const catalogDb = testDatabase('mobile/assets/catalog.sqlite'), personal = testDatabase();
    try {
      const catalog = createCatalogReader(work => work(catalogDb.db));
      // The shipped seed still contains the older first-portion choice.
      expect(JSON.parse((catalogDb.raw.prepare('SELECT food FROM foods WHERE id=?').get(egg.id) as { food: string }).food).servingGrams).toBe(243);
      await expect(catalog.getFood(egg.id)).resolves.toMatchObject({ servingGrams: 50, servingLabel: '1 large (50 g)' });
      expect((await catalog.search('eggs')).find(food => food.id === egg.id)).toMatchObject({ servingGrams: 50 });
      const oldRepo = await createLocalRepository(personal.db, { ...catalog, getFood: async () => egg }, () => 'old-entry');
      const oldEntry = await oldRepo.addEntry({ date: '2026-09-23', meal: 'Breakfast', sourceId: egg.id, quantity: 1, unit: 'serving' });
      const repo = await createLocalRepository(personal.db, catalog, () => 'new-entry');
      const added = await repo.addEntry({ date: '2026-09-23', meal: 'Breakfast', sourceId: egg.id, quantity: 2, unit: 'serving' });
      expect(added).toMatchObject({ grams: 100, calories: 143, servingLabel: '1 large (50 g)' });
      expect((await repo.getDay('2026-09-23')).entries.find(entry => entry.id === oldEntry.id)).toEqual(oldEntry);
      expect(oldEntry.grams).toBe(243);
    } finally { catalogDb.raw.close(); personal.raw.close(); }
  });

  it('logs the selected size canonically and edits the recorded portion without replacing it with the default', async () => {
    const personal = testDatabase(), food = preferredFoodServing(egg);
    const medium = foodServingOptions(food).find(option => option.label === '1 medium (44 g)')!;
    try {
      const repo = await createLocalRepository(personal.db, { getFood: async () => food, search: async () => [], barcode: async () => null });
      const entry = await repo.addEntry({ date: '2026-09-23', meal: 'Breakfast', sourceId: egg.id, quantity: 2, unit: 'serving', servingId: medium.id, grams: 999, calories: 999 });
      expect(entry).toMatchObject({ grams: 88, servingLabel: '1 medium (44 g)' });
      expect(entry.calories).toBeCloseTo(125.84);
      const edited = await repo.updateEntry(entry.id, { meal: 'Breakfast', quantity: 3, unit: 'serving' });
      expect(edited).toMatchObject({ grams: 132, servingLabel: '1 medium (44 g)' });
      expect(edited.calories).toBeCloseTo(188.76);
      await expect(repo.addEntry({ date: '2026-09-23', meal: 'Breakfast', sourceId: egg.id, quantity: 1, unit: 'serving', servingId: 'another-foods-portion' })).rejects.toThrow('serving size is unavailable');
    } finally { personal.raw.close(); }
  });

  it('retains alternate portions in recipe validation, storage, and backup restoration', async () => {
    const food = preferredFoodServing(egg);
    const small = foodServingOptions(food).find(option => option.label === '1 small (38 g)')!;
    const selected = selectFoodServing(food, small.id)!;
    const meal = mealInputSchema.parse({ name: 'Small egg breakfast', ingredients: [{ food: selected, quantity: 2, unit: 'serving' }], totalGrams: null, servingGrams: 76 });
    const personal = testDatabase(), restored = testDatabase();
    const catalog = { getFood: async () => food, search: async () => [], barcode: async () => null };
    try {
      const repo = await createLocalRepository(personal.db, catalog);
      await repo.saveMeal(meal);
      const next = await createLocalRepository(restored.db, catalog);
      await next.importArchive(JSON.stringify(await repo.exportArchive()));
      const saved = (await next.listMeals()).meals[0];
      expect(saved.ingredients[0].food).toMatchObject({ selectedServingId: small.id, servingGrams: 38, servingLabel: '1 small (38 g)', servingOptions: food.servingOptions });
      expect(ingredientTotals(saved.ingredients).grams).toBe(76);
      expect(ingredientTotals(saved.ingredients).calories).toBeCloseTo(108.68);
    } finally { personal.raw.close(); restored.raw.close(); }
  });
});

describe('serving choices for any food', () => {
  it('keeps all published egg sizes and the cup measure with the practical default selected', () => {
    const food = preferredFoodServing(egg);
    expect(foodServingOptions(food).map(option => option.grams).sort((a, b) => a! - b!)).toEqual([38, 44, 50, 56, 63, 243]);
    expect(selectedFoodServingId(food)).toBe(food.servingOptions![0].id);
    const cup = selectFoodServing(food, food.servingOptions!.find(option => option.grams === 243)!.id)!;
    expect(scaleFood(cup, .5, 'serving')?.grams).toBe(121.5);
    expect(cup.calories).toBe(food.calories);
  });

  it('supports named portions beyond eggs and preserves per-serving nutrition through repeated selections', () => {
    const bread: Food = { ...egg, id: 'bread', name: 'Bread', source: 'Test', nutritionBasis: 'serving', servingLabel: '1 slice', servingGrams: 25, calories: 100,
      servingOptions: [{ id: 'thick', label: '1 thick slice', grams: 50 }] };
    const thick = selectFoodServing(bread, 'thick')!;
    expect(scaleFood(thick, 2, 'serving')).toMatchObject({ grams: 100, calories: 400 });
    expect(scaleFood(thick, 25, 'grams')?.calories).toBe(100);
    const original = selectFoodServing(thick, 'default')!;
    expect(original).toMatchObject({ servingGrams: 25, calories: 100, servingLabel: '1 slice' });
    expect(selectFoodServing(original, 'thick')?.calories).toBe(200);
  });

  it('supports volume portions without inventing a gram conversion and rejects unavailable choices', () => {
    const drink: Food = { ...egg, id: 'juice', name: 'Juice', nutritionBasis: '100ml', nutritionUnit: 'ml', servingGrams: null, servingMl: 250, servingLabel: '1 glass', calories: 40,
      servingOptions: [{ id: 'glass', label: '1 glass', ml: 250 }, { id: 'small', label: '1 small glass', ml: 150 }] };
    expect(selectedFoodServingId(drink)).toBe('glass');
    expect(scaleFood(selectFoodServing(drink, 'small')!, 2, 'serving')).toMatchObject({ grams: null, calories: 120 });
    expect(selectFoodServing(drink, 'missing')).toBeNull();
    expect(selectFoodServing(egg)).toBe(egg);
    expect(foodServingOptions(egg)).toEqual([]);
    expect(foodServingOptions({ ...drink, nutritionBasis: 'serving' })).toEqual([]);
  });
});

type Portion = { amount?: number; modifier: string; gramWeight: number };
function imported(description: string, foodPortions: Portion[]) {
  const item = { fdcId: 171287, description, foodPortions,
    foodNutrients: [{ nutrient: { id: 1008 }, amount: 143 }, { nutrient: { id: 1003 }, amount: 12.56 },
      { nutrient: { id: 1005 }, amount: .72 }, { nutrient: { id: 1004 }, amount: 9.51 }] };
  const result = spawnSync('python3', ['-c', `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('usda', 'scripts/import-usda.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps(module.normalize(json.load(sys.stdin))))
`], { input: JSON.stringify(item), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout) as Food;
}

describe('USDA portion selection', () => {
  it('chooses the published large egg regardless of source ordering', () => {
    const portions = [
      { amount: 1, modifier: 'cup (4.86 large eggs)', gramWeight: 243 },
      { amount: 1, modifier: 'medium', gramWeight: 44 },
      { amount: 1, modifier: 'extra large', gramWeight: 56 },
      { amount: 1, modifier: 'small', gramWeight: 38 },
      { amount: 1, modifier: 'jumbo', gramWeight: 63 },
      { amount: 1, modifier: 'large', gramWeight: 50 },
    ];
    for (const values of [portions, [...portions].reverse()]) {
      expect(imported(egg.name, values)).toMatchObject({ servingGrams: 50, servingLabel: '1 large (50 g)', calories: 143, protein: 12.56 });
    }
    const options = imported(egg.name, portions).servingOptions!;
    expect(options).toEqual(imported(egg.name, [...portions].reverse()).servingOptions);
    expect(options.map(option => option.grams)).toEqual([50, 38, 44, 56, 63, 243]);
    expect(new Set(options.map(option => option.id)).size).toBe(portions.length);
  });

  it('prefers medium fruit and a normal bread slice over cups and extreme sizes', () => {
    expect(imported('Bananas, raw', [
      { amount: 1, modifier: 'NLEA serving', gramWeight: 126 },
      { amount: 1, modifier: 'large', gramWeight: 136 },
      { amount: 1, modifier: 'cup, sliced', gramWeight: 150 },
      { amount: 1, modifier: 'medium', gramWeight: 118 },
    ])).toMatchObject({ servingGrams: 118, servingLabel: '1 medium (118 g)' });
    expect(imported('Bread, white', [
      { amount: 1, modifier: 'cup, crumbs', gramWeight: 45 },
      { amount: 1, modifier: 'slice, very thin', gramWeight: 15 },
      { amount: 1, modifier: 'slice', gramWeight: 29 },
    ])).toMatchObject({ servingGrams: 29, servingLabel: '1 slice (29 g)' });
  });

  it('keeps published counts and weights paired, including half portions and multi-piece servings', () => {
    expect(imported('Chicken breast', [
      { amount: 1, modifier: 'cup, diced', gramWeight: 140 },
      { amount: 1, modifier: 'unit (yield from 1 lb ready-to-cook chicken)', gramWeight: 52 },
      { amount: .5, modifier: 'breast, bone and skin removed', gramWeight: 86 },
    ])).toMatchObject({ servingGrams: 86, servingLabel: '0.5 breast, bone and skin removed (86 g)' });
    expect(imported('Asparagus', [{ amount: 4, modifier: 'spears', gramWeight: 60 }]))
      .toMatchObject({ servingGrams: 60, servingLabel: '4 spears (60 g)' });
  });

  it('keeps a labeled product serving instead of defaulting to a fun-size variant', () => {
    expect(imported('Chocolate candy bar', [
      { amount: 1, modifier: 'serving 1.66 oz bar', gramWeight: 47 },
      { amount: 1, modifier: 'bar fun size', gramWeight: 15 },
    ])).toMatchObject({ servingGrams: 47 });
  });

  it('keeps cups for bulk foods and falls back to 100 g when portions are unusable', () => {
    expect(imported('Rice, cooked', [{ amount: 1, modifier: 'cup', gramWeight: 158 }]))
      .toMatchObject({ servingGrams: 158, servingLabel: '1 cup (158 g)' });
    expect(imported('Food without a usable portion', [
      { amount: 0, modifier: 'piece', gramWeight: 10 },
      { amount: 1, modifier: 'slice', gramWeight: -5 },
      { amount: 1, modifier: '', gramWeight: 10 },
    ])).toMatchObject({ servingGrams: 100, servingLabel: '100 g' });
  });
});
