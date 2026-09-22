import { z } from 'zod';
import { parseCustomFood, scaleFood, type Food } from '../../../lib/food';
import { mealFood, type CustomMeal } from '../../../lib/meals';
import { localDate } from '../../../lib/diary-date';
import { foodSearchIssue, type FoodSearchIssue } from '../../../lib/food-search';
import { defaultWaterGoal, waterDateSchema, waterEntrySchema, waterGoalSchema, type WaterDay } from '../../../lib/water';
import { serialized, transaction, type SqliteConnection } from './database';
import { entrySchema, goalsSchema, mealSchema, parseArchive, validateRecord, units, type Archive, type PersonalRecord } from './records';

export interface FoodCatalog {
  getFood(id: string): Promise<Food | null>;
  search(query: string, options?: { online?: boolean; signal?: AbortSignal }): Promise<Food[]>;
  barcode(code: string, signal?: AbortSignal): Promise<Food | null>;
}
const defaults = { calories: 2400, protein: 180, carbs: 250, fat: 70 };
export async function createLocalRepository(db: SqliteConnection, catalog: FoodCatalog, uuid: () => string = () => globalThis.crypto.randomUUID()) {
  await serialized(db, async () => {
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) > 1) throw new Error('Update Gramello to open this diary.');
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    await transaction(db, async () => db.execAsync(`
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, date TEXT, value TEXT NOT NULL CHECK(json_valid(value)), PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS records_day ON records(kind,date);
      CREATE TABLE IF NOT EXISTS recovery (id INTEGER PRIMARY KEY CHECK(id=1), archive TEXT NOT NULL);
      PRAGMA user_version = 1;
    `));
  });
  const all = async (): Promise<PersonalRecord[]> => (await db.getAllAsync<{ kind: string; id: string; date: string | null; value: string }>('SELECT * FROM records ORDER BY kind,id'))
    .map(row => validateRecord({ ...row, value: JSON.parse(row.value) }));
  const read = async <T>(kind: string, id: string): Promise<T | null> => {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM records WHERE kind=? AND id=?', kind, id);
    return row ? JSON.parse(row.value) as T : null;
  };
  const list = async <T>(kind: string, date?: string): Promise<T[]> => (await db.getAllAsync<{ value: string }>(
    `SELECT value FROM records WHERE kind=?${date ? ' AND date=?' : ''} ORDER BY json_extract(value, '$.createdAt'), id`, ...[kind, ...(date ? [date] : [])]))
    .map(row => JSON.parse(row.value) as T);
  const put = async (record: unknown) => {
    const row = validateRecord(record);
    await db.runAsync('INSERT INTO records(kind,id,date,value) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET date=excluded.date,value=excluded.value', row.kind, row.id, row.date, JSON.stringify(row.value));
  };
  // Apply import bounds to exports and recovery snapshots too. A replacement
  // must fail before deletion if the previous diary cannot be restored.
  const archive = async (): Promise<Archive> => parseArchive(JSON.stringify({ format: 'gramello', version: 1, exportedAt: new Date().toISOString(), records: await all() }));
  const replace = async (next: Archive) => transaction(db, async () => {
    await db.runAsync('INSERT INTO recovery(id,archive) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET archive=excluded.archive', JSON.stringify(await archive()));
    await db.runAsync('DELETE FROM records');
    for (const row of next.records) await put(row);
  });
  const findFood = async (id: string): Promise<Food | null> => {
    if (id.startsWith('meal-')) { const meal = await read<CustomMeal>('meal', id.slice(5)); return meal ? mealFood(meal) : null; }
    return await read<Food>('food', id) ?? await catalog.getFood(id);
  };
  const remove = (kind: string, id: string) => serialized(db, async () => { await db.runAsync('DELETE FROM records WHERE kind=? AND id=?', kind, id); return { ok: true }; });
  return {
    getDay: (date: string) => serialized(db, async () => ({ goals: await read<typeof defaults>('goals', 'default') ?? defaults, entries: await list<z.infer<typeof entrySchema>>('entry', waterDateSchema.parse(date)) })),
    saveGoals: (input: unknown) => serialized(db, async () => { const value = goalsSchema.parse(input); await put({ kind: 'goals', id: 'default', date: null, value }); return value; }),
    addEntry: (input: unknown) => serialized(db, async () => {
      const body = z.object({ date: waterDateSchema, meal: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snacks']), sourceId: z.string().min(1), quantity: z.number().positive().max(1e6), unit: units }).parse(input);
      const food = await findFood(body.sourceId);
      if (!food) throw new Error('Food not found. Search again or create a custom food.');
      const portion = scaleFood(food, body.quantity, body.unit);
      if (!portion) throw new Error('Choose a supported serving amount.');
      const value = entrySchema.parse({ ...body, ...portion, id: uuid(), createdAt: new Date().toISOString(), name: food.name, brand: food.brand, source: food.source, verified: food.verified, sourceUrl: food.sourceUrl, servingLabel: food.servingLabel });
      await put({ kind: 'entry', id: value.id, date: value.date, value }); return value;
    }),
    removeEntry: (id: string) => remove('entry', id),
    getTrends: (days: number, today = localDate()) => serialized(db, async () => {
      if (![7, 30, 183].includes(days)) throw new Error('Unsupported trend range.');
      const end = waterDateSchema.parse(today);
      const start = new Date(`${end}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - days + 1);
      return db.getAllAsync<{ date: string; calories: number; protein: number; carbs: number; fat: number }>(`SELECT date,
        ROUND(SUM(json_extract(value,'$.calories'))+1e-9,1) calories, ROUND(SUM(json_extract(value,'$.protein'))+1e-9,1) protein,
        ROUND(SUM(json_extract(value,'$.carbs'))+1e-9,1) carbs, ROUND(SUM(json_extract(value,'$.fat'))+1e-9,1) fat
        FROM records WHERE kind='entry' AND date BETWEEN ? AND ? GROUP BY date ORDER BY date`, start.toISOString().slice(0,10), end);
    }),
    searchFoods: async (query: string, options?: { online?: boolean; signal?: AbortSignal }) => {
      if (query.length > 200) throw new Error('Search with a shorter name.');
      if (query.trim().length < 2) return { foods: [], partial: false, hasMore: false };
      const tokens = query.toLowerCase().trim().split(/\s+/);
      const custom = (await serialized(db, () => list<Food>('food'))).filter(food => tokens.every(t => `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(t)));
      let found: Food[];
      const issues: FoodSearchIssue[] = [];
      try { found = await catalog.search(query, options); }
      catch (error) {
        if (!options?.online || options.signal?.aborted) throw error;
        found = await catalog.search(query, { signal: options.signal });
        issues.push(foodSearchIssue('Open Food Facts', error));
      }
      const foods = [...custom, ...found];
      return { foods: foods.slice(0,100), hasMore: foods.length > 100, partial: issues.length > 0, issues };
    },
    // Network lookups must not hold the diary connection's transaction queue.
    lookupBarcode: async (code: string, signal?: AbortSignal) => { const food = await catalog.barcode(code, signal); if (!food) throw new Error('No product found for this barcode. Try searching online by name or add a custom food.'); return { food }; },
    createFood: (input: unknown) => serialized(db, async () => {
      const food: Food = { ...parseCustomFood(input), id: `custom-${uuid()}`, source: 'My foods', sourceKind: 'custom', verified: false, nutritionBasis: 'serving' };
      await put({ kind: 'food', id: food.id, date: null, value: food }); return { food };
    }),
    listMeals: () => serialized(db, async () => ({ meals: (await list<CustomMeal>('meal')).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) })),
    saveMeal: (input: unknown, existingId?: string) => serialized(db, async () => {
      if (existingId && !await read('meal', existingId)) throw new Error('Saved meal not found.');
      const meal = mealSchema.parse({ ...(input as object), id: existingId ?? uuid(), updatedAt: new Date().toISOString() });
      await put({ kind: 'meal', id: meal.id, date: null, value: meal }); return { meal };
    }),
    deleteMeal: (id: string) => remove('meal', id),
    getWaterDay: (date: string): Promise<WaterDay> => serialized(db, async () => {
      const day = waterDateSchema.parse(date), entries = await list<WaterDay['entries'][number]>('water', day);
      return { date: day, goal: await read<WaterDay['goal']>('waterGoal', 'default') ?? defaultWaterGoal, entries, totalMl: entries.reduce((n,e) => n + e.amountMl, 0) };
    }),
    addWater: (input: unknown) => serialized(db, async () => { const value = { ...waterEntrySchema.parse(input), id: uuid(), createdAt: new Date().toISOString() }; await put({ kind: 'water', id: value.id, date: value.date, value }); return value; }),
    removeWater: (id: string) => remove('water', id),
    saveWaterGoal: (input: unknown) => serialized(db, async () => { const value = waterGoalSchema.parse(input); await put({ kind: 'waterGoal', id: 'default', date: null, value }); return value; }),
    exportArchive: () => serialized(db, archive),
    importArchive: (text: string) => serialized(db, () => replace(parseArchive(text))),
    hasRecovery: () => serialized(db, async () => Boolean(await db.getFirstAsync('SELECT id FROM recovery WHERE id=1'))),
    restorePrevious: () => serialized(db, async () => { const row = await db.getFirstAsync<{ archive: string }>('SELECT archive FROM recovery WHERE id=1'); if (!row) throw new Error('No previous diary is available.'); await replace(parseArchive(row.archive)); }),
  };
}
export type LocalRepository = Awaited<ReturnType<typeof createLocalRepository>>;
