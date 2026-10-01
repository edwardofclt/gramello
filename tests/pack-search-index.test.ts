import { afterEach, expect, it } from 'vitest';
import { createPackSearchIndex } from '../mobile/src/catalog/pack-search-index';
import type { Food } from '../lib/food';
import type { FoodPack } from '../mobile/src/catalog/packs';
import { testDatabase } from './helpers/local-sqlite';

const databases: ReturnType<typeof testDatabase>[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.raw.close(); });
const database = () => { const db = testDatabase(); databases.push(db); return db; };
const descriptor = (bucket = 0, generation = 1): FoodPack => ({
  schemaVersion: 1, id: `off-256-${bucket}`, source: 'off', license: 'ODbL-1.0', market: 'US',
  bucket, buckets: 256, version: `v${generation}`, count: 1, bytes: 4096,
  sha256: (generation * 256 + bucket).toString(16).padStart(64, '0'), url: 'https://example.org/pack.sqlite',
});
const food = (id: string, name: string, brand = 'Test'): Food => ({
  id, name, brand, source: 'Open Food Facts', sourceKind: 'database', verified: true,
  servingLabel: '1 bowl', servingGrams: 150, calories: 230, protein: 10, carbs: 30, fat: 8,
});
async function setup() {
  const db = database();
  const index = createPackSearchIndex(async (_write, work) => work(db.db));
  const sources = new Map<string, ReturnType<typeof database>>(), opened: string[] = [];
  const add = async (pack: FoodPack, foods: Food[]) => {
    const source = database(); sources.set(pack.sha256, source);
    await source.db.execAsync('CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT)');
    for (const item of foods) await source.db.runAsync('INSERT INTO foods VALUES(?,?,?)', item.id, item.name, JSON.stringify(item));
    await index.index(pack, source.db);
  };
  const hydrate = async (pack: FoodPack, ids: string[]) => {
    opened.push(pack.id);
    const rows = await sources.get(pack.sha256)!.db.getAllAsync<{ food: string }>(`SELECT food FROM foods WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
    return rows.map(row => JSON.parse(row.food) as Food);
  };
  return { index, add, hydrate, opened, db, sources };
}

it('searches 256 indexed chunks while opening only the pack with matching candidates', async () => {
  const fake = await setup(), packs = Array.from({ length: 256 }, (_, bucket) => descriptor(bucket));
  for (const pack of packs) await fake.add(pack, [food(`off-${100000 + pack.bucket}`, pack.bucket === 211 ? 'Apple maple sausage' : 'Unrelated rice crackers')]);
  expect(await fake.index.missing(packs)).toEqual([]);
  const result = await fake.index.search('apple maple sausage', {}, packs, fake.hydrate);
  expect(result.foods.map(food => food.id)).toEqual(['off-100211']);
  expect(fake.opened).toEqual([packs[211].id]);
  fake.opened.length = 0;
  expect((await fake.index.search('nonexistent product', {}, packs, fake.hydrate)).foods).toEqual([]);
  expect(fake.opened).toEqual([]);
});

it('normalizes joined apostrophes, accents, plurals, brand filters and prefixes in FTS', async () => {
  const fake = await setup(), pack = { ...descriptor(), count: 2 };
  await fake.add(pack, [food('off-1', 'Café chicken sausages', "Amy’s"), food('off-2', 'Chicken sausage', 'Other')]);
  expect((await fake.index.search('amys cafe chicken sausage', {}, [pack], fake.hydrate)).foods.map(food => food.id)).toEqual(['off-1']);
  expect((await fake.index.search('chicken saus', { brand: "Amy's", category: 'packaged' }, [pack], fake.hydrate)).foods.map(food => food.id)).toEqual(['off-1']);
});

it('keeps staged generations invisible until activation and suppresses renamed older identities', async () => {
  const fake = await setup(), old = descriptor(), replacement = descriptor(0, 2);
  await fake.add(old, [food('off-1', 'Apple sausage')]);
  await fake.add(replacement, [food('off-1', 'Turkey patty')]);
  expect((await fake.index.search('apple sausage', {}, [old], fake.hydrate)).foods.map(food => food.id)).toEqual(['off-1']);
  expect((await fake.index.search('turkey patty', {}, [old], fake.hydrate)).foods).toEqual([]);
  // First in the input is authoritative: overlap during repartition must not
  // allow an older matching name to resurrect an identity renamed by its successor.
  expect((await fake.index.search('apple sausage', {}, [replacement, old], fake.hydrate)).foods).toEqual([]);
  expect((await fake.index.search('turkey patty', {}, [replacement, old], fake.hydrate)).foods[0].name).toBe('Turkey patty');
});

it('withholds a source during partial preparation so unindexed replacements cannot resurrect older identities', async () => {
  const fake = await setup(), old = descriptor(), replacement = descriptor(1, 2);
  await fake.add(old, [food('off-1', 'Apple sausage')]);
  const partial = await fake.index.search('apple sausage', {}, [replacement, old], fake.hydrate);
  expect(partial.foods).toEqual([]);
  expect(partial.issues?.[0].message).toMatch(/prepar/i);
  expect(fake.opened).toEqual([]);
  await fake.add(replacement, [food('off-1', 'Turkey patty')]);
  expect((await fake.index.search('apple sausage', {}, [replacement, old], fake.hydrate)).foods).toEqual([]);
  expect((await fake.index.search('turkey patty', {}, [replacement, old], fake.hydrate)).foods[0].name).toBe('Turkey patty');
});

it('rolls back interrupted indexing and retries without duplicating candidates', async () => {
  const fake = await setup(), pack = descriptor();
  const source = database(); await source.db.execAsync('CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT)');
  await source.db.runAsync('INSERT INTO foods VALUES(?,?,?)', 'off-1', 'Chicken sausage', '{broken');
  await expect(fake.index.index(pack, source.db)).rejects.toThrow();
  expect(await fake.index.missing([pack])).toEqual([pack]);
  await fake.add(pack, [food('off-1', 'Chicken sausage')]);
  await fake.index.index(pack, fake.sources.get(pack.sha256)!.db);
  expect((await fake.index.search('chicken sausage', {}, [pack], fake.hydrate)).foods).toHaveLength(1);
});

it('does no indexing on search and reports missing preparation as partial results', async () => {
  const fake = await setup(), pack = descriptor();
  const result = await fake.index.search('chicken', {}, [pack], fake.hydrate);
  expect(result.foods).toEqual([]);
  expect(result.issues).toContainEqual(expect.objectContaining({ source: 'Downloaded foods', message: expect.stringMatching(/prepar/i) }));
  expect(fake.opened).toEqual([]);
  expect(await fake.index.missing([pack])).toEqual([pack]);
});

it('retains indexed candidates across recreation and removes retired generations', async () => {
  const fake = await setup(), old = descriptor(), replacement = descriptor(0, 2);
  await fake.add(old, [food('off-1', 'Apple sausage')]);
  await fake.add(replacement, [food('off-2', 'Apple patty')]);
  const reopened = createPackSearchIndex(async (_write, work) => work(fake.db.db));
  expect((await reopened.search('apple', {}, [old], fake.hydrate)).foods).toHaveLength(1);
  await reopened.retire([replacement]);
  expect(await reopened.missing([replacement])).toEqual([]);
  expect(await reopened.missing([old])).toEqual([old]);
  expect((await reopened.search('apple', {}, [replacement], fake.hydrate)).foods.map(food => food.id)).toEqual(['off-2']);
});

it('bounds candidate hydration and preserves real nutrients, serving metadata and pagination', async () => {
  const fake = await setup(), pack = { ...descriptor(), count: 60 };
  await fake.add(pack, Array.from({ length: 60 }, (_, id) => food(`off-${id}`, `Chicken sausage ${id}`)));
  const result = await fake.index.search('chicken sausage', { window: 20 }, [pack], fake.hydrate);
  expect(result.foods).toHaveLength(20); expect(result.canExpand).toBe(true);
  expect(result.foods[0]).toMatchObject({ calories: 230, protein: 10, servingGrams: 150, servingLabel: '1 bowl' });
  expect(fake.opened).toHaveLength(1);
});

it('cancels before opening the index or hydrating canonical records', async () => {
  let opened = 0;
  const index = createPackSearchIndex(async (_write, work) => { opened++; return work(database().db); });
  const controller = new AbortController(); controller.abort();
  await expect(index.search('chicken', { signal: controller.signal }, [descriptor()], async () => [])).rejects.toThrow(/cancel/i);
  expect(opened).toBe(0);
});
