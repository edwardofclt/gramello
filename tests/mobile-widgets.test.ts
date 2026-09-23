import { afterEach, expect, it } from 'vitest';
import { testDatabase } from './helpers/local-sqlite';
import { createLocalRepository } from '../mobile/src/local/repository';
import { withWidgetRefresh } from '../mobile/src/widgets/sync';
import { isTodayWidgetLink } from '../mobile/src/widgets/links';

const opened: ReturnType<typeof testDatabase>[] = [];
const now = new Date('2026-03-09T03:30:00Z');
async function setup() {
  const db = testDatabase(); opened.push(db);
  const repo = await createLocalRepository(db.db, { getFood: async () => null, search: async () => [], barcode: async () => null });
  return { ...db, repo };
}
afterEach(() => { for (const db of opened.splice(0)) db.raw.close(); });

it('summarizes the local day, with saved goals and exact water amounts', async () => {
  const { repo } = await setup();
  const { food } = await repo.createFood({ name:'Soup',servingLabel:'bowl',servingGrams:null,calories:300,protein:20,carbs:40,fat:5 });
  await repo.addEntry({ date:'2026-03-08',meal:'Lunch',sourceId:food.id,quantity:1.5,unit:'serving' });
  await repo.addEntry({ date:'2026-03-09',meal:'Lunch',sourceId:food.id,quantity:2,unit:'serving' });
  await repo.saveGoals({ calories:400,protein:0,carbs:10,fat:5 });
  await repo.addWater({ date:'2026-03-08',amountMl:236.5882365 });
  await repo.addWater({ date:'2026-03-09',amountMl:500 });
  await repo.saveWaterGoal({ goalMl:1800,unit:'fl-oz' });
  expect(await repo.getWidgetSummary(now, 'America/New_York')).toEqual({
    version:1,status:'ready',date:'2026-03-08',timeZone:'America/New_York',generatedAt:now.toISOString(),
    consumed:{ calories:450,protein:30,carbs:60,fat:7.5 },goals:{ calories:400,protein:0,carbs:10,fat:5 },
    hasFood:true,hasWater:true,hasSavedGoals:true,hasSavedWaterGoal:true,
    waterMl:236.5882365,waterGoalMl:1800,waterUnit:'fl-oz',
  });
});

it('distinguishes empty logs and default goals; rejects corrupt stored entries', async () => {
  const { repo, raw } = await setup();
  expect(await repo.getWidgetSummary(now,'UTC')).toMatchObject({ date:'2026-03-09',consumed:{calories:0},hasFood:false,hasWater:false,hasSavedGoals:false,hasSavedWaterGoal:false,waterMl:0,waterGoalMl:2000 });
  raw.prepare('INSERT INTO records VALUES(?,?,?,?)').run('water','bad','2026-03-09',JSON.stringify({id:'bad',date:'2026-03-09',amountMl:-1,createdAt:now.toISOString()}));
  await expect(repo.getWidgetSummary(now,'UTC')).rejects.toThrow();
});

it('refreshes committed changes including replacement and recovery, and never hides successful writes', async () => {
  const { repo } = await setup();
  const snapshots: number[] = [];
  const wrapped = withWidgetRefresh(repo,async () => { snapshots.push((await repo.getWidgetSummary(now,'UTC')).waterMl); });
  await wrapped.addWater({date:'2026-03-09',amountMl:250});
  const backup = await wrapped.exportArchive();
  await wrapped.importArchive(JSON.stringify({...backup,records:[]}));
  await wrapped.restorePrevious();
  await expect(wrapped.addWater({date:'bad',amountMl:250})).rejects.toThrow();
  expect(snapshots).toEqual([250,0,250]);
  const broken = withWidgetRefresh(repo,async () => { throw new Error('No App Group'); });
  await expect(broken.addWater({date:'2026-03-09',amountMl:500})).resolves.toMatchObject({amountMl:500});
  expect((await repo.getWidgetSummary(now,'UTC')).waterMl).toBe(750);
});

it('publishes revised nutrition after a food edit and skips failed edits', async () => {
  const { repo } = await setup();
  const { food } = await repo.createFood({ name:'Soup',servingLabel:'bowl',servingGrams:null,calories:300,protein:20,carbs:40,fat:5 });
  const entry = await repo.addEntry({ date:'2026-03-09',meal:'Lunch',sourceId:food.id,quantity:1,unit:'serving' });
  const snapshots: unknown[] = [];
  const wrapped = withWidgetRefresh(repo,async () => { snapshots.push((await repo.getWidgetSummary(now,'UTC')).consumed); });
  await wrapped.updateEntry(entry.id,{meal:'Dinner',quantity:2,unit:'serving'});
  await expect(wrapped.updateEntry(entry.id,{meal:'Dinner',quantity:0,unit:'serving'})).rejects.toThrow();
  expect(snapshots).toEqual([{calories:600,protein:40,carbs:80,fat:10}]);
});

it('serializes publication and retries after a publication failure', async () => {
  const { repo } = await setup();
  let active = 0, maximum = 0, count = 0;
  const wrapped = withWidgetRefresh(repo,async () => {
    active++; maximum = Math.max(maximum,active);
    await new Promise(resolve => setTimeout(resolve,5)); active--; count++;
    if (count === 1) throw new Error('Disk busy');
  });
  await Promise.all([wrapped.addWater({date:'2026-03-09',amountMl:100}),wrapped.addWater({date:'2026-03-09',amountMl:200})]);
  expect(maximum).toBe(1); expect(count).toBe(2);
});

it('accepts only the today widget route', () => {
  expect(isTodayWidgetLink('nourish://diary/today')).toBe(true);
  for (const url of [null,'https://diary/today','nourish://diary/yesterday','nourish://other/today','not a URL']) expect(isTodayWidgetLink(url)).toBe(false);
});
