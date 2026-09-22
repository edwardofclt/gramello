import { env } from 'cloudflare:workers';
import { defaultWaterGoal, type WaterDay, type WaterEntry, type WaterGoal } from '@/lib/water';

function db() { if (!env.DB) throw new Error('Water storage unavailable'); return env.DB; }

export async function getWaterDay(userId: string, date: string): Promise<WaterDay> {
  const [goal, rows] = await Promise.all([
    db().prepare('SELECT goal_ml as goalMl, unit FROM water_goals WHERE user_id = ?').bind(userId).first<WaterGoal>(),
    db().prepare('SELECT id, entry_date as date, amount_ml as amountMl, created_at as createdAt FROM water_entries WHERE user_id = ? AND entry_date = ? ORDER BY created_at ASC, id ASC').bind(userId, date).all<WaterEntry>(),
  ]);
  const entries = rows.results ?? [];
  return { date, goal: goal ?? defaultWaterGoal, entries, totalMl: entries.reduce((total, entry) => total + entry.amountMl, 0) };
}

export async function saveWaterGoal(userId: string, goal: WaterGoal) {
  await db().prepare('INSERT INTO water_goals (user_id, goal_ml, unit, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET goal_ml=excluded.goal_ml, unit=excluded.unit, updated_at=excluded.updated_at')
    .bind(userId, goal.goalMl, goal.unit, new Date().toISOString()).run();
  return goal;
}

export async function addWater(userId: string, input: { date: string; amountMl: number }): Promise<WaterEntry> {
  const entry = { id: crypto.randomUUID(), ...input, createdAt: new Date().toISOString() };
  await db().prepare('INSERT INTO water_entries (id, user_id, entry_date, amount_ml, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(entry.id, userId, entry.date, entry.amountMl, entry.createdAt).run();
  return entry;
}

export async function removeWater(userId: string, id: string) {
  await db().prepare('DELETE FROM water_entries WHERE id = ? AND user_id = ?').bind(id, userId).run();
}
