import { afterEach, beforeAll, expect, it } from 'vitest';
import sqlite3Init from '@sqlite.org/sqlite-wasm';
import { createBrowserPackSearch } from '../lib/browser-local/pack-search';
import { openMemoryDatabase, type SqliteModule } from '../lib/browser-local/sqlite';
import type { FoodPack } from '../mobile/src/catalog/packs';
import type { SnapshotStore } from '../lib/browser-local/persistence';
let sqlite: SqliteModule;
beforeAll(async () => { sqlite = await sqlite3Init() as unknown as SqliteModule; });
const closes: Array<() => void> = [];
afterEach(() => { for (const close of closes.splice(0)) close(); });
const pack: FoodPack = { schemaVersion: 1, id: 'off-1-0', source: 'off', market: 'US', license: 'ODbL-1.0', bucket: 0, buckets: 1, version: 'v1', url: 'https://example.org/a.sqlite', sha256: 'a'.repeat(64), bytes: 4096, count: 1 };
async function setup() {
  const values = new Map<string, unknown>(); let fail = false, snapshots = 0;
  const store: SnapshotStore = {
    read: async <T>(key: string) => { if (key === 'packs:search') snapshots++; return values.get(key) as T | undefined; },
    commit: async pairs => { if (fail) throw new Error('quota'); for (const [key, value] of pairs) values.set(key, value); },
  };
  const source = openMemoryDatabase(sqlite); closes.push(() => source.close());
  await source.execAsync('CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT,food TEXT)');
  const food = { id: 'off-1', name: "Amy’s chicken sausage", brand: "Amy’s", source: 'Open Food Facts', servingLabel: '1 patty', servingGrams: 50, calories: 180, protein: 18, carbs: 10, fat: 8 };
  await source.runAsync('INSERT INTO foods VALUES(?,?,?)', food.id, food.name, JSON.stringify(food));
  const create = () => { const index = createBrowserPackSearch(() => sqlite, store); closes.push(index.close); return index; };
  return { create, store, food, source, snapshots: () => snapshots, reset: () => { snapshots = 0; }, fail: () => { fail = true; } };
}
it('persists the fallback index and searches it across worker restart without reloading every snapshot', async () => {
  const fake = await setup(), index = fake.create(); await index.index(pack, fake.source);
  const reopened = fake.create(); fake.reset();
  expect((await reopened.search('amys chicken sausage', {}, [pack], async () => [fake.food])).foods).toEqual([fake.food]);
  expect((await reopened.search('amys chicken sausage', {}, [pack], async () => [fake.food])).foods).toEqual([fake.food]);
  expect(fake.snapshots()).toBe(1);
});
it('discards failed durable writes and keeps the prior generation readable', async () => {
  const fake = await setup(), index = fake.create(); await index.index(pack, fake.source);
  expect((await index.search('chicken sausage', {}, [pack], async () => [fake.food])).foods).toHaveLength(1);
  fake.fail(); const next = { ...pack, version: 'v2', sha256: 'b'.repeat(64) };
  await expect(index.index(next, fake.source)).rejects.toThrow('quota');
  const reopened = fake.create();
  expect(await reopened.missing([pack, next])).toEqual([next]);
  expect((await reopened.search('chicken sausage', {}, [pack], async () => [fake.food])).foods).toHaveLength(1);
});
it('requests preparation after FTS failure and rebuilds the fallback without changing source foods', async () => {
  const fake = await setup(), index = fake.create(); await index.index(pack, fake.source);
  const damaged = openMemoryDatabase(sqlite, await fake.store.read<Uint8Array<ArrayBuffer>>('packs:search'));
  try {
    await damaged.execAsync('DROP TABLE pack_search_terms');
    expect(await damaged.getFirstAsync('SELECT count(*) AS count FROM search_packs')).toEqual({ count: 1 });
    await fake.store.commit([['packs:search', damaged.export()], ['packs:search-revision', 'damaged']]);
  } finally { damaged.close(); }
  await expect(index.search('chicken sausage', {}, [pack], async () => [fake.food])).rejects.toThrow();
  await expect(index.missing([pack])).rejects.toThrow(/rebuilt/);
  await index.reset(); await index.index(pack, fake.source);
  expect((await index.search('chicken sausage', {}, [pack], async () => [fake.food])).foods).toEqual([fake.food]);
  expect(await index.missing([pack])).toEqual([]);
});
