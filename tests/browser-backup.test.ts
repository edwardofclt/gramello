import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('cloudflare:workers', () => runtime);

import { GET } from '../app/api/backup/route';
import { addEntry, saveGoals } from '../db/store';
import { createCustomFood } from '../db/foods';
import { saveMeal } from '../db/meals';
import { addWater, saveWaterGoal } from '../db/water';
import { createLocalRepository } from '../mobile/src/local/repository';
import { parseArchive, type Archive } from '../mobile/src/local/records';
import { testDatabase } from './helpers/local-sqlite';

const alice = `browser:${'a'.repeat(64)}`;
const bob = `browser:${'b'.repeat(64)}`;
const database = new DatabaseSync(':memory:');
for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(file => file.endsWith('.sql')).sort()) {
  database.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
}
const binding = {
  prepare(sql: string) {
    return { bind(...args: (string | number | null)[]) {
      const statement = database.prepare(sql);
      return {
        first: async () => statement.get(...args) ?? null,
        all: async () => ({ results: statement.all(...args) }),
        run: async () => statement.run(...args),
      };
    } };
  },
};
const tables = ['entries', 'foods', 'custom_meals', 'goals', 'water_entries', 'water_goals'];
const opened: ReturnType<typeof testDatabase>[] = [];
const foodDraft = { name: 'Homemade soup', servingLabel: '1 bowl', servingGrams: null, calories: 210, protein: 10, carbs: 25, fat: 8 };
const entryDraft = { date: '2001-01-01', meal: 'Dinner', name: 'Old soup', source: 'custom', quantity: 1.5, unit: 'serving', grams: null, calories: 315, protein: 15, carbs: 37.5, fat: 12 };
const goals = { calories: 2050, protein: 120, carbs: 230, fat: 65 };

function request(userId?: string, options: { path?: string; headers?: Record<string, string> } = {}) {
  return GET(new Request(`https://gramello.test${options.path ?? '/api/backup'}`, {
    headers: { ...(userId ? { cookie: `gramello_diary=${userId.slice('browser:'.length)}` } : {}), ...options.headers },
  }));
}
function contents() {
  return tables.map(table => database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}
function sorted(records: Archive['records']) {
  return [...records].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}
async function seed(userId: string) {
  const food = await createCustomFood(userId, foodDraft);
  const oldEntry = await addEntry(userId, entryDraft);
  const futureEntry = await addEntry(userId, { ...entryDraft, date: '2099-12-31', sourceId: food.id });
  await saveGoals(userId, goals);
  const water = await addWater(userId, { date: '2000-02-29', amountMl: 236.5882365 });
  await saveWaterGoal(userId, { goalMl: 2400, unit: 'fl-oz' });
  const meal = await saveMeal(userId, { name: 'Soup batch', ingredients: [{ food, quantity: 2, unit: 'serving' }], totalGrams: 450, servingGrams: 150 });
  if (!meal) throw new Error('Expected a saved meal.');
  return { food, oldEntry, futureEntry, water, meal };
}

beforeEach(() => {
  for (const table of tables) database.exec(`DELETE FROM ${table}`);
  Object.assign(runtime.env, { DB: binding, APP_BASE_URL: 'https://gramello.test' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const local of opened.splice(0)) local.raw.close();
  vi.restoreAllMocks();
});
afterAll(() => database.close());

describe('hosted browser diary backup', () => {
  it('exports an empty native archive without synthesizing default goals and sets a private cookie', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(response.headers.get('set-cookie')).toMatch(/^gramello_diary=[a-f0-9]{64};.*HttpOnly.*Secure/);
    expect(parseArchive(await response.text()).records).toEqual([]);
    expect(contents().every(rows => rows.length === 0)).toBe(true);
  });

  it('exports all dates and every personal record type into the native importer without changing hosted data', async () => {
    const saved = await seed(alice);
    const before = contents();
    const response = await request(alice);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    const text = await response.text();
    const archive = parseArchive(text);
    expect(archive.records).toHaveLength(7);
    expect(archive.records.map(record => record.kind).sort()).toEqual(['entry', 'entry', 'food', 'goals', 'meal', 'water', 'waterGoal']);
    const old = archive.records.find(record => record.id === saved.oldEntry.id)!;
    expect(old).toMatchObject({ kind: 'entry', date: '2001-01-01', value: { ...entryDraft, verified: false } });
    expect(old.value).not.toHaveProperty('brand');
    expect(old.value).not.toHaveProperty('sourceId');
    expect(old.value).not.toHaveProperty('sourceUrl');
    expect(old.value).not.toHaveProperty('servingLabel');
    const food = archive.records.find(record => record.id === saved.food.id)!;
    expect(food.value).toMatchObject({ servingGrams: null, sourceKind: 'custom', verified: false });
    for (const optional of ['brand', 'sourceUrl', 'image', 'checkedAt', 'servingMl', 'createdBy']) expect(food.value).not.toHaveProperty(optional);
    expect(archive.records.find(record => record.id === saved.futureEntry.id)).toMatchObject({ date: '2099-12-31' });
    const local = testDatabase(); opened.push(local);
    const repository = await createLocalRepository(local.db, { getFood: async () => null, search: async () => [], barcode: async () => null });
    await repository.importArchive(text);
    expect(sorted((await repository.exportArchive()).records)).toEqual(sorted(archive.records));
    expect((await repository.getDay('2001-01-01')).entries[0]).toMatchObject({ id: saved.oldEntry.id, calories: 315 });
    expect((await repository.getDay('2099-12-31')).entries[0]).toMatchObject({ id: saved.futureEntry.id, sourceId: saved.food.id });
    expect((await repository.getDay('2026-09-26')).goals).toEqual(goals);
    expect((await repository.getWaterDay('2000-02-29'))).toMatchObject({ totalMl: 236.5882365, goal: { goalMl: 2400, unit: 'fl-oz' } });
    expect((await repository.listMeals()).meals).toEqual([saved.meal]);
    expect(contents()).toEqual(before);
  });

  it('isolates every record type by the cookie and excludes shared or other owners’ custom foods', async () => {
    const own = await seed(alice);
    const other = await seed(bob);
    await saveGoals(bob, { calories: 1700, protein: 80, carbs: 200, fat: 60 });
    await saveWaterGoal(bob, { goalMl: 1800, unit: 'ml' });
    await seed('site-owner');
    const shared = await createCustomFood('shared', foodDraft);
    database.prepare('UPDATE foods SET created_by = NULL WHERE id = ?').run(shared.id);
    const cached = await createCustomFood(alice, foodDraft);
    database.prepare("UPDATE foods SET source_kind = 'database' WHERE id = ?").run(cached.id);
    const before = contents();
    const response = await request(alice, { path: `/api/backup?userId=${bob}`, headers: { 'oai-authenticated-user-id': bob, authorization: 'Bearer legacy-token' } });
    const archive = parseArchive(await response.text());
    expect(archive.records).toHaveLength(7);
    expect(archive.records.filter(record => record.kind === 'food').map(record => record.id)).toEqual([own.food.id]);
    expect(archive.records.filter(record => record.kind === 'entry').map(record => record.id).sort()).toEqual([own.oldEntry.id, own.futureEntry.id].sort());
    expect(archive.records.find(record => record.kind === 'water')?.id).toBe(own.water.id);
    expect(archive.records.find(record => record.kind === 'meal')?.id).toBe(own.meal.id);
    expect(archive.records.find(record => record.kind === 'goals')?.value).toEqual(goals);
    expect(archive.records.find(record => record.kind === 'waterGoal')?.value).toEqual({ goalMl: 2400, unit: 'fl-oz' });
    expect(JSON.stringify(archive)).not.toContain(other.food.id);
    const otherArchive = parseArchive(await (await request(bob)).text());
    expect(otherArchive.records.find(record => record.kind === 'food')?.id).toBe(other.food.id);
    const emptyArchive = parseArchive(await (await request()).text());
    expect(emptyArchive.records).toEqual([]);
    expect(contents()).toEqual(before);
  });

  it.each([
    "UPDATE entries SET quantity = 0",
    "UPDATE entries SET verified = 2",
    "UPDATE entries SET created_at = 'invalid'",
    "UPDATE foods SET serving_label = '' || printf('%0300d', 1)",
    "UPDATE custom_meals SET ingredients = 'not-json'",
  ])('fails the entire export for invalid stored data: %s', async sql => {
    await seed(alice);
    database.exec(sql);
    const before = contents();
    const response = await request(alice);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: expect.stringMatching(/could not be (imported|read).*No hosted data was changed/) });
    expect(contents()).toEqual(before);
  });

  it('fails without returning a partial archive if storage is unavailable', async () => {
    await seed(alice);
    delete runtime.env.DB;
    const response = await request(alice);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Your hosted diary could not be exported right now. No hosted data was changed.' });
    expect(database.prepare('SELECT COUNT(*) AS count FROM entries').get()).toMatchObject({ count: 2 });
  });

  it('rejects a backup above the native 32 MB limit without changing any hosted records', async () => {
    const saved = await seed(alice);
    const insert = database.prepare(`INSERT INTO entries (id, user_id, entry_date, meal, food_name, source,
      quantity, unit, grams, calories, protein, carbs, fat, source_url, created_at)
      VALUES (?, ?, '2001-01-01', 'Lunch', ?, 'Custom', 1, 'serving', NULL, 100, 0, 0, 0, ?, '2026-09-26T12:00:00.000Z')`);
    database.exec('BEGIN');
    for (let i = 0; i < 15000; i++) insert.run(`large-${i}`, alice, 's'.repeat(300), `https://example.com/${'a'.repeat(1800)}`);
    database.exec('COMMIT');
    const response = await request(alice);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expect.stringContaining('32 MB') });
    expect(database.prepare('SELECT COUNT(*) AS count FROM entries').get()).toMatchObject({ count: 15002 });
    expect(database.prepare('SELECT id FROM foods').get()).toMatchObject({ id: saved.food.id });
  }, 15000);
});
