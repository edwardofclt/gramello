import { env } from 'cloudflare:workers';
import type { CustomFoodInput, Food } from '../lib/food';
import { FOOD_SEARCH_CANDIDATE_LIMIT, foodSearchLikeTerms, foodSearchTerms, rankFoodSearch } from '../lib/food-search-ranking';
import { preferredFoodServing } from '../lib/food-servings';

const columns = `id, name, brand, source, source_kind as sourceKind, source_url as sourceUrl, verified,
  nutrition_basis as nutritionBasis, serving_grams as servingGrams, serving_ml as servingMl, serving_label as servingLabel,
  calories, protein, carbs, fat, image, checked_at as checkedAt`;
function database() { if (!env.DB) throw new Error('Food catalog unavailable'); return env.DB; }
function fromRow(row: Omit<Food, 'verified'> & { verified?: boolean | number }): Food {
  return preferredFoodServing({ ...row, verified: row.verified === true || row.verified === 1,
    ...(row.nutritionBasis === '100ml' ? { nutritionUnit: 'ml' as const } : {}), servingMl: row.servingMl ?? undefined,
    brand: row.brand ?? undefined, sourceUrl: row.sourceUrl ?? undefined, image: row.image ?? undefined, checkedAt: row.checkedAt ?? undefined });
}
export async function getFood(id: string): Promise<Food | null> {
  const row = await database().prepare(`SELECT ${columns} FROM foods WHERE id = ?`).bind(id).first<Food>();
  return row ? fromRow(row) : null;
}
export async function findFoods(query: string, limit = 100): Promise<Food[]> {
  const tokens = foodSearchLikeTerms(query);
  if (!tokens.length) return [];
  const searchable = "lower(replace(replace(replace(replace(name || ' ' || coalesce(brand, ''), '''', ''), '’', ''), '‘', ''), 'ʼ', ''))";
  const where = tokens.map(forms => `(${forms.map(() => `${searchable} LIKE ? ESCAPE '~'`).join(' OR ')})`).join(' AND ');
  const patterns = tokens.flat().map(token => `%${token.replace(/[~%_]/g, value => `~${value}`)}%`);
  const rows = await database().prepare(`SELECT ${columns} FROM foods WHERE ${where} ORDER BY CASE WHEN lower(replace(replace(coalesce(brand,''), '''', ''), '’', '')) = ? THEN 0 WHEN lower(name) = ? THEN 1 ELSE 2 END, verified DESC, brand, name, id LIMIT ?`).bind(...patterns, foodSearchTerms(query).join(' '), query.toLowerCase(), Math.max(limit, FOOD_SEARCH_CANDIDATE_LIMIT)).all<Food>();
  return rankFoodSearch((rows.results ?? []).map(fromRow), query).slice(0, limit);
}
async function writeFood(food: Food, createdBy: string | null) {
  await database().prepare(`INSERT INTO foods (id,name,brand,source,source_kind,source_url,verified,nutrition_basis,serving_grams,serving_ml,serving_label,calories,protein,carbs,fat,image,created_by,checked_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,brand=excluded.brand,source=excluded.source,source_url=excluded.source_url,
    serving_grams=excluded.serving_grams,serving_ml=excluded.serving_ml,serving_label=excluded.serving_label,nutrition_basis=excluded.nutrition_basis,
    calories=excluded.calories,protein=excluded.protein,carbs=excluded.carbs,fat=excluded.fat,image=excluded.image,checked_at=excluded.checked_at`)
    .bind(food.id, food.name, food.brand || null, food.source, food.sourceKind || 'custom', food.sourceUrl || null, food.verified ? 1 : 0,
      food.nutritionBasis || (food.nutritionUnit === 'ml' ? '100ml' : '100g'), food.servingGrams, food.servingMl ?? null, food.servingLabel, food.calories, food.protein, food.carbs, food.fat,
      food.image || null, createdBy, food.checkedAt || null, new Date().toISOString()).run();
}
export async function cacheDatabaseFoods(foods: Food[]) {
  // Only server-side provider adapters call this; users cannot write trusted rows.
  for (const food of foods) {
    if (food.sourceKind !== 'database' || !food.verified || !/^(?:off|usda|generic)-/.test(food.id)) throw new Error('Invalid provider record');
    await writeFood(food, null);
  }
}
export async function createCustomFood(userId: string, input: CustomFoodInput): Promise<Food> {
  const food: Food = { ...input, id: `custom-${crypto.randomUUID()}`, source: 'Community submitted', sourceKind: 'custom', verified: false, nutritionBasis: 'serving' };
  await writeFood(food, userId);
  return food;
}
