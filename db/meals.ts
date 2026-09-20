import { env } from 'cloudflare:workers';
import type { CustomMeal, MealInput } from '@/lib/meals';

type MealRow = Omit<CustomMeal, 'ingredients'> & { ingredients: string };
const columns = 'id, name, ingredients, total_grams as totalGrams, serving_grams as servingGrams, updated_at as updatedAt';
const decode = (row: MealRow): CustomMeal => ({ ...row, ingredients: JSON.parse(row.ingredients) });
function db() { if (!env.DB) throw new Error('Meal storage unavailable'); return env.DB; }

export async function listMeals(userId: string) {
  const rows = await db().prepare(`SELECT ${columns} FROM custom_meals WHERE user_id = ? ORDER BY updated_at DESC, id`).bind(userId).all<MealRow>();
  return (rows.results ?? []).map(decode);
}
export async function saveMeal(userId: string, input: MealInput, id?: string) {
  const meal: CustomMeal = { ...input, id: id ?? crypto.randomUUID(), updatedAt: new Date().toISOString() };
  if (id) {
    const row = await db().prepare(`UPDATE custom_meals SET name = ?, ingredients = ?, total_grams = ?, serving_grams = ?, updated_at = ? WHERE id = ? AND user_id = ? RETURNING ${columns}`)
      .bind(meal.name, JSON.stringify(meal.ingredients), meal.totalGrams, meal.servingGrams, meal.updatedAt, id, userId).first<MealRow>();
    return row ? decode(row) : null;
  }
  await db().prepare('INSERT INTO custom_meals (id, user_id, name, ingredients, total_grams, serving_grams, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(meal.id, userId, meal.name, JSON.stringify(meal.ingredients), meal.totalGrams, meal.servingGrams, meal.updatedAt).run();
  return meal;
}
export async function deleteMeal(userId: string, id: string) {
  return Boolean(await db().prepare('DELETE FROM custom_meals WHERE id = ? AND user_id = ? RETURNING id').bind(id, userId).first());
}
