import { env } from "cloudflare:workers";
export type Goals = { calories: number; protein: number; carbs: number; fat: number };
export type EntryInput = { date: string; meal: string; name: string; brand?: string; source: string; sourceId?: string; quantity: number; unit: string; grams: number; calories: number; protein: number; carbs: number; fat: number };
const defaults: Goals = { calories: 2400, protein: 180, carbs: 250, fat: 70 };
function db() { if (!env.DB) throw new Error("Diary storage unavailable"); return env.DB; }
export async function getDay(userId: string, date: string) {
  const [goalRow, entryRows] = await Promise.all([
    db().prepare("SELECT calories, protein, carbs, fat FROM goals WHERE user_id = ?").bind(userId).first<Goals>(),
    db().prepare("SELECT id, meal, food_name as name, brand, source, source_id as sourceId, quantity, unit, grams, calories, protein, carbs, fat, created_at as createdAt FROM entries WHERE user_id = ? AND entry_date = ? ORDER BY created_at ASC").bind(userId, date).all(),
  ]);
  return { goals: goalRow ?? defaults, entries: entryRows.results ?? [] };
}
export async function saveGoals(userId: string, goals: Goals) {
  await db().prepare("INSERT INTO goals (user_id, calories, protein, carbs, fat, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET calories=excluded.calories, protein=excluded.protein, carbs=excluded.carbs, fat=excluded.fat, updated_at=excluded.updated_at").bind(userId, goals.calories, goals.protein, goals.carbs, goals.fat, new Date().toISOString()).run(); return goals;
}
export async function addEntry(userId: string, item: EntryInput) {
  const id = crypto.randomUUID();
  await db().prepare("INSERT INTO entries (id, user_id, entry_date, meal, food_name, brand, source, source_id, quantity, unit, grams, calories, protein, carbs, fat, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, userId, item.date, item.meal, item.name, item.brand ?? null, item.source, item.sourceId ?? null, item.quantity, item.unit, item.grams, item.calories, item.protein, item.carbs, item.fat, new Date().toISOString()).run(); return { id, ...item };
}
export async function removeEntry(userId: string, id: string) { await db().prepare("DELETE FROM entries WHERE id = ? AND user_id = ?").bind(id, userId).run(); }
export async function getTrends(userId: string, days: number) {
  const rows = await db().prepare("SELECT entry_date as date, ROUND(SUM(calories), 1) as calories, ROUND(SUM(protein), 1) as protein, ROUND(SUM(carbs), 1) as carbs, ROUND(SUM(fat), 1) as fat FROM entries WHERE user_id = ? AND entry_date >= date('now', ?) GROUP BY entry_date ORDER BY entry_date ASC").bind(userId, `-${days - 1} days`).all();
  return rows.results ?? [];
}
