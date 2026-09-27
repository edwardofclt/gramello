import { env } from 'cloudflare:workers';
import type { CustomFoodInput, Food } from '../lib/food';
import { preferredFoodServing } from '../lib/food-servings';
import type { FoodSearchOptions } from '../lib/food-search';
import { analyzeFoodQuery, foodSearchTerms, rankFoodSearch, stapleFoodIds } from '../lib/search';

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
export async function findFoodsWindow(query: string, options: FoodSearchOptions | number = {}): Promise<{ foods: Food[]; canExpand: boolean }> {
  const settings = typeof options === 'number' ? { window: options } : options;
  const budget = Math.max(1, Math.min(1000, settings.window ?? 100));
  const analysis = analyzeFoodQuery(query);
  const matches = analysis.variants.map(variant => (variant.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0,10).map(token => `"${token}"*`).join(' AND ')).filter(Boolean);
  if (!matches.length) return { foods: [], canExpand: false };
  const queryMatch = matches.map(value => `(${value})`).join(' OR ');
  // Use lexical brand aliases without spelling correction, matching shared ranking.
  // Search name as well as brand so historical USDA embedded brands remain eligible.
  const brandTokens = foodSearchTerms(settings.brand ?? '').slice(0, 10);
  const match = [`(${queryMatch})`, ...brandTokens.map(token => `"${token}"*`)].join(' AND ');
  const category = `CASE WHEN id LIKE 'restaurant-%' OR source_kind='restaurant' THEN 'restaurant'
    WHEN id LIKE 'custom-%' OR source_kind='custom' THEN 'custom'
    WHEN id LIKE 'off-%' OR trim(coalesce(brand,''))<>'' THEN 'packaged' ELSE 'generic' END`;
  const categories = settings.category && settings.category !== 'all' ? [settings.category] : ['generic','packaged','restaurant','custom'];
  const groups = await Promise.all(categories.map(async group => {
    // Include unbranded USDA names in packaged retrieval; metadata recognizes embedded brands.
    const pool = group === 'packaged' ? `(${category}=? OR id LIKE 'usda-%')` : `${category}=?`;
    const rows = await database().prepare(`SELECT ${columns} FROM foods WHERE rowid IN
      (SELECT rowid FROM food_search WHERE food_search MATCH ?) AND ${pool}
      ORDER BY CASE WHEN lower(name)=? THEN 0 WHEN lower(name) LIKE ? THEN 1 ELSE 2 END, verified DESC, name, id LIMIT ?`)
      .bind(match, group, analysis.normalized, `${analysis.normalized}%`, budget + 1).all<Food>();
    return (rows.results ?? []).map(fromRow);
  }));
  const anchors = await Promise.all(stapleFoodIds(query).map(getFood));
  return { foods: rankFoodSearch(query, [...groups.flat(), ...anchors.filter((food): food is Food => !!food)], settings).foods, canExpand: budget < 1000 && groups.some(group => group.length > budget) };
}
export async function findFoods(query: string, options: FoodSearchOptions | number = {}): Promise<Food[]> {
  return (await findFoodsWindow(query, options)).foods;
}
// D1 serializes this atomic conditional upsert across isolates. The interval is
// deliberately conservative (one search per 7 seconds, including failed calls).
export async function reserveHostedOffSearch(): Promise<boolean> {
  const now = Date.now();
  const row = await database().prepare(`INSERT INTO food_provider_quota(provider,next_allowed_at) VALUES('off',?)
    ON CONFLICT(provider) DO UPDATE SET next_allowed_at=excluded.next_allowed_at
    WHERE food_provider_quota.next_allowed_at<=? RETURNING provider`).bind(now + 7000, now).first();
  return !!row;
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
