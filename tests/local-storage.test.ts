import { afterEach, describe, expect, it } from 'vitest';
import { testDatabase } from './helpers/local-sqlite';
import { createLocalRepository } from '../mobile/src/local/repository';
import { createLocalApi } from '../mobile/src/local/api';
import { parseArchive, archiveCsv } from '../mobile/src/local/records';
import type { Food } from '../lib/food';

const rice: Food = { id: 'usda-1', name: 'Rice', source: 'USDA', sourceKind: 'database', verified: true, nutritionBasis: '100g', servingGrams: 100, servingLabel: '100 g', calories: 130, protein: 2.7, carbs: 28, fat: .3 };
const catalog = { getFood: async (id: string) => id === rice.id ? rice : null, search: async () => [rice], barcode: async () => rice };
const opened: ReturnType<typeof testDatabase>[] = [];
async function setup() {
  const database = testDatabase(); opened.push(database);
  const repo = await createLocalRepository(database.db, catalog);
  return { ...database, repo, api: createLocalApi(repo) };
}
afterEach(() => { for (const db of opened.splice(0)) db.raw.close(); });

describe('device SQLite diary', () => {
  it('edits a logged snapshot in place without consulting a changed catalog', async () => {
    const { db, api } = await setup();
    const original = await api<{ id: string; createdAt: string }>('/api/entries', { method: 'POST', body: { date: '2026-09-22', meal: 'Lunch', sourceId: rice.id, quantity: 150, unit: 'grams' } });
    const reopened = await createLocalRepository(db, { ...catalog, getFood: async () => { throw new Error('Offline'); } });
    const nextApi = createLocalApi(reopened);
    await nextApi(`/api/entries?id=${original.id}`, { method: 'PUT', body: { meal: 'Dinner', quantity: 300, unit: 'grams', calories: 999, name: 'Forged' } });
    expect((await reopened.getDay('2026-09-22')).entries).toEqual([expect.objectContaining({ id: original.id, createdAt: original.createdAt, name: 'Rice', meal: 'Dinner', quantity: 300, grams: 300, calories: 390, carbs: 84, verified: true })]);
    expect(await reopened.getTrends(7, '2026-09-22')).toEqual([{ date: '2026-09-22', calories: 390, protein: 8.1, carbs: 84, fat: .9 }]);
    for (const body of [{ meal: 'Dinner', quantity: 0, unit: 'grams' }, { meal: 'Dinner', quantity: 100, unit: 'milliliters' }, { meal: 'Invalid', quantity: 100, unit: 'grams' }]) {
      await expect(nextApi(`/api/entries?id=${original.id}`, { method: 'PUT', body })).rejects.toThrow();
    }
    await expect(nextApi('/api/entries?id=missing', { method: 'PUT', body: { meal: 'Lunch', quantity: 1, unit: 'serving' } })).rejects.toThrow('Food entry not found');
    expect((await reopened.getDay('2026-09-22')).entries[0].calories).toBe(390);
  });
  it('supports every trend range exposed by the native screen', async () => {
    const { api } = await setup();
    for (const days of [7,30,183]) await expect(api(`/api/trends?days=${days}`)).resolves.toEqual({ days:[] });
    await expect(api('/api/trends?days=999999')).rejects.toThrow();
  });
  it('supports native search, saved-meal edits and removals through the screen adapter', async () => {
    const { api } = await setup();
    await expect(api('/api/foods/search?q=rice')).resolves.toMatchObject({ foods:[{ id:rice.id }] });
    await expect(api('/api/foods/barcode?code=012345678905')).resolves.toMatchObject({ food:{ id:rice.id } });
    const input = { name:'Rice batch',ingredients:[{ food:rice,quantity:200,unit:'grams' }],totalGrams:200,servingGrams:50 };
    const saved = await api<{meal:{id:string}}>('/api/meals',{method:'POST',body:input});
    await api(`/api/meals?id=${saved.meal.id}`,{method:'PUT',body:{...input,name:'Renamed rice'}});
    await expect(api('/api/meals')).resolves.toMatchObject({meals:[{name:'Renamed rice'}]});
    const entry = await api<{id:string}>('/api/entries',{method:'POST',body:{date:'2026-09-22',meal:'Dinner',sourceId:`meal-${saved.meal.id}`,quantity:1,unit:'serving'}});
    await api(`/api/meals?id=${saved.meal.id}`,{method:'DELETE'});
    await expect(api('/api/meals')).resolves.toEqual({meals:[]});
    await expect(api('/api/day?date=2026-09-22')).resolves.toMatchObject({entries:[{name:'Renamed rice',calories:65}]});
    await api(`/api/entries?id=${entry.id}`,{method:'DELETE'});
    await expect(api('/api/day?date=2026-09-22')).resolves.toMatchObject({entries:[]});
    const water = await api<{id:string}>('/api/water',{method:'POST',body:{date:'2026-09-22',amountMl:250}});
    await api(`/api/water?id=${water.id}`,{method:'DELETE'});
    await expect(api('/api/water?date=2026-09-22')).resolves.toMatchObject({entries:[],totalMl:0});
  });
  it('logs a calculated snapshot and preserves it after catalog changes and reopening', async () => {
    const { db, repo, api } = await setup();
    await api('/api/entries', { method: 'POST', body: { date: '2026-09-22', meal: 'Lunch', sourceId: rice.id, quantity: 150, unit: 'grams', calories: 999 } });
    const next = await createLocalRepository(db, { ...catalog, getFood: async () => ({ ...rice, calories: 999 }) });
    const day = await next.getDay('2026-09-22');
    expect(day.entries).toHaveLength(1);
    expect(day.entries[0]).toMatchObject({ calories: 195, carbs: 42, quantity: 150, grams: 150, verified: true });
    expect(await repo.getTrends(7, '2026-09-22')).toEqual([{ date: '2026-09-22', calories: 195, protein: 4.1, carbs: 42, fat: .5 }]);
  });
  it('round-trips foods, recipes, diary, goals and exact water volume into a fresh database', async () => {
    const { repo, api } = await setup();
    const { food } = await api<{ food: Food }>('/api/foods/custom', { method: 'POST', body: { name: 'My soup', servingLabel: 'bowl', servingGrams: null, calories: 210, protein: 10, carbs: 25, fat: 8 } });
    await api('/api/entries', { method: 'POST', body: { date: '2024-02-29', meal: 'Dinner', sourceId: food.id, quantity: 1.5, unit: 'serving' } });
    await api('/api/meals', { method: 'POST', body: { name: 'Rice batch', ingredients: [{ food: rice, quantity: 200, unit: 'grams' }], totalGrams: 180, servingGrams: 45 } });
    await api('/api/goals', { method: 'PUT', body: { calories: 2000, protein: 150, carbs: 220, fat: 60 } });
    await api('/api/water', { method: 'POST', body: { date: '2024-02-29', amountMl: 236.5882365 } });
    await api('/api/water/goals', { method: 'PUT', body: { goalMl: 2400, unit: 'fl-oz' } });
    const archive = await repo.exportArchive();
    const destination = await setup();
    await destination.repo.importArchive(JSON.stringify(archive));
    expect((await destination.repo.exportArchive()).records).toEqual(archive.records);
    expect((await destination.repo.getDay('2024-02-29')).entries[0]).toMatchObject({ calories: 315, grams: null });
    expect((await destination.repo.getWaterDay('2024-02-29')).totalMl).toBe(236.5882365);
  });
  it('rejects invalid and duplicate records before replacing data, and recovers the previous import', async () => {
    const { repo, api } = await setup();
    await api('/api/water', { method: 'POST', body: { date: '2026-09-22', amountMl: 250 } });
    const original = await repo.exportArchive();
    await expect(repo.importArchive(JSON.stringify({ ...original, version: 999 }))).rejects.toThrow();
    await expect(repo.importArchive(JSON.stringify({ ...original, records: [...original.records, ...original.records] }))).rejects.toThrow();
    expect((await repo.exportArchive()).records).toEqual(original.records);
    await repo.importArchive(JSON.stringify({ ...original, records: [] }));
    expect((await repo.getWaterDay('2026-09-22')).totalMl).toBe(0);
    await repo.restorePrevious();
    expect((await repo.exportArchive()).records).toEqual(original.records);
  });
  it('rolls back a replacement if SQLite rejects an inserted record', async () => {
    const { repo, raw, api } = await setup();
    await api('/api/water', { method: 'POST', body: { date: '2026-09-22', amountMl: 250 } });
    const original = await repo.exportArchive();
    raw.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON records WHEN NEW.kind = 'water' BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END;");
    await expect(repo.importArchive(JSON.stringify(original))).rejects.toThrow('simulated disk failure');
    expect((await repo.exportArchive()).records).toEqual(original.records);
  });
  it.each(['export','replace'])('refuses unrestorable %s before changing a large diary', async operation => {
    const { repo, raw, api } = await setup();
    const empty = JSON.stringify(await repo.exportArchive());
    await api('/api/entries',{method:'POST',body:{date:'2026-09-22',meal:'Lunch',sourceId:rice.id,quantity:1,unit:'serving'}});
    const initial = (await repo.exportArchive()).records.find(r => r.kind === 'entry')!;
    const insert = raw.prepare('INSERT INTO records(kind,id,date,value) VALUES(?,?,?,?)');
    raw.exec('BEGIN');
    for(let i=0;i<15000;i++) {
      const id = `large-${i}`;
      insert.run('entry',id,'2026-09-22',JSON.stringify({...initial.value,id,name:'r'.repeat(300),sourceUrl:`https://example.com/${'a'.repeat(1800)}`}));
    }
    raw.exec('COMMIT');
    let message = '';
    try { if(operation === 'export') await repo.exportArchive(); else await repo.importArchive(empty); }
    catch(error) { message = (error as Error).message; }
    expect(message).toContain('32 MB');
    expect(raw.prepare('SELECT COUNT(*) count FROM records').get()).toMatchObject({count:15001});
    await expect(repo.hasRecovery()).resolves.toBe(false);
  });
  it('serializes concurrent writes and exports without losing records', async () => {
    const { repo, api } = await setup();
    await Promise.all(Array.from({ length: 20 }, (_, i) => api('/api/water', { method: 'POST', body: { date: '2026-09-22', amountMl: 100 + i } })));
    expect((await repo.exportArchive()).records.filter(r => r.kind === 'water')).toHaveLength(20);
    expect((await repo.getWaterDay('2026-09-22')).totalMl).toBe(2190);
  });
  it('rejects impossible dates and unsupported routes and never invokes a network', async () => {
    const { api } = await setup();
    await expect(api('/api/water', { method: 'POST', body: { date: '2025-02-29', amountMl: 100 } })).rejects.toThrow();
    await expect(api('https://example.com/api/day')).rejects.toThrow();
    await expect(api('/api/unknown')).rejects.toThrow();
    const controller = new AbortController(); controller.abort();
    await expect(api('/api/day?date=2026-09-22', { signal: controller.signal })).rejects.toThrow();
  });
  it('escapes CSV formulas, quotes and newlines without changing the complete archive', async () => {
    const { repo, api } = await setup();
    const { food } = await api<{ food: Food }>('/api/foods/custom', { method: 'POST', body: { name: '=FORMULA,"soup"\nnew line', servingLabel: 'bowl', calories: 100, protein: 0, carbs: 0, fat: 0 } });
    await api('/api/entries', { method: 'POST', body: { date: '2026-09-22', meal: 'Lunch', sourceId: food.id, quantity: 1, unit: 'serving' } });
    const archive = parseArchive(JSON.stringify(await repo.exportArchive()));
    expect(archiveCsv(archive).diary).toContain('"\'=FORMULA,""soup""\nnew line"');
    expect(archive.records.find(r => r.kind === 'entry')?.value).toMatchObject({ name: '=FORMULA,"soup"\nnew line' });
  });
});
