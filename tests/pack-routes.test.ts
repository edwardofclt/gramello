import { describe, expect, it } from 'vitest';
import { readPackIds } from '../mobile/src/catalog/pack-routes';
import { createBrowserPackRoutes } from '../lib/browser-local/pack-routes';
import { testDatabase } from './helpers/local-sqlite';
import type { FoodPack } from '../mobile/src/catalog/packs';
const pack: FoodPack = { schemaVersion: 1, id: 'usda-branded-1-0', source: 'usda-branded', market: 'US', license: 'CC0-1.0', buckets: 1, bucket: 0,
  version: 'v1', url: 'https://example.org/p.sqlite', sha256: 'a'.repeat(64), bytes: 4096, count: 1 };
function setup() {
  const values = new Map<string, unknown>(); let fail = false;
  const store = { read: async <T>(key: string) => structuredClone(values.get(key)) as T | undefined,
    readMany: async <T>(keys: readonly string[]) => keys.map(key => structuredClone(values.get(key)) as T | undefined),
    commit: async (pairs: readonly (readonly [string, unknown])[]) => { if (fail) throw new Error('quota'); for (const [key, value] of pairs) values.set(key, structuredClone(value)); } };
  return { store, routes: createBrowserPackRoutes(store), fail: () => { fail = true; } };
}
describe('local USDA routes', () => {
  it('batches activation, replacement and retirement reads without splitting the commit', async () => {
    const values = new Map<string, unknown>();
    const reads: string[] = [], batches: string[][] = []; let commits = 0;
    const store = {
      async read<T>(key: string) { reads.push(key); return structuredClone(values.get(key)) as T | undefined; },
      async readMany<T>(keys: readonly string[]) { batches.push([...keys]); return keys.map(key => structuredClone(values.get(key)) as T | undefined); },
      async commit(pairs: readonly (readonly [string, unknown])[]) { commits++; for (const [key, value] of pairs) values.set(key, structuredClone(value)); },
    };
    const routes = createBrowserPackRoutes(store);
    const ids = Array.from({ length: 1001 }, (_, i) => `usda-${i}`), pages = [ids.slice(0, 500), ids.slice(500, 1000), ids.slice(1000)];
    await store.commit(await routes.change({ pack, pages }));
    expect(reads).toHaveLength(0); expect(batches.map(keys => keys.length)).toEqual([500, 500, 1]); expect(commits).toBe(1);
    for (const id of ids) expect(values.get(`packs:usda-route:${id}`)).toEqual([{ id: pack.id, sha256: pack.sha256 }]);
    reads.length = 0; batches.length = 0;
    const next = { ...pack, sha256: 'b'.repeat(64) };
    await store.commit(await routes.change({ pack: next, pages }, [pack]));
    expect(reads).toHaveLength(4); expect(reads.every(key => key.startsWith('packs:usda-index:'))).toBe(true);
    expect(batches.map(keys => keys.length)).toEqual([500, 500, 1]); expect(commits).toBe(2);
    for (const id of ids) expect(values.get(`packs:usda-route:${id}`)).toEqual([{ id: next.id, sha256: next.sha256 }]);
    reads.length = 0; batches.length = 0;
    await store.commit(await routes.change(undefined, [next]));
    expect(reads).toHaveLength(4); expect(batches.map(keys => keys.length)).toEqual([500, 500, 1]); expect(commits).toBe(3);
    for (const id of ids) expect(values.get(`packs:usda-route:${id}`)).toEqual([]);
    expect(await routes.indexed(next)).toBe(false);
  });
  it('bounds oversized route pages and does not duplicate overlapping identities', async () => {
    const values = new Map<string, unknown>(), sizes: number[] = [];
    const store = {
      async read<T>(key: string) { return structuredClone(values.get(key)) as T | undefined; },
      async readMany<T>(keys: readonly string[]) { sizes.push(keys.length); return keys.map(key => structuredClone(values.get(key)) as T | undefined); },
      async commit(pairs: readonly (readonly [string, unknown])[]) { for (const [key, value] of pairs) values.set(key, structuredClone(value)); },
    };
    const routes = createBrowserPackRoutes(store), ids = Array.from({ length: 1001 }, (_, i) => `usda-${i}`);
    await store.commit(await routes.change({ pack, pages: [[], ids, ['usda-0']] }));
    expect(sizes).toEqual([500, 500, 1]);
    expect(await routes.lookup('usda-0', [pack])).toEqual({ packs: [pack], complete: true });
    expect(values.get('packs:usda-route:usda-0')).toEqual([{ id: pack.id, sha256: pack.sha256 }]);
  });
  it('extracts stable bounded pages from real SQLite', async () => {
    const { db, raw } = testDatabase();
    try {
      raw.exec('CREATE TABLE foods(id TEXT PRIMARY KEY);');
      for (let i = 0; i < 1001; i++) raw.prepare('INSERT INTO foods VALUES(?)').run(`usda-${String(i).padStart(6, '0')}`);
      const pages: string[][] = []; await readPackIds(db, async ids => { pages.push(ids); });
      expect(pages.map(page => page.length)).toEqual([500, 500, 1]); expect(new Set(pages.flat()).size).toBe(1001);
    } finally { raw.close(); }
  });
  it('filters stale hashes and keeps overlapping active generations', async () => {
    const fake = setup(); const next = { ...pack, id: 'usda-branded-2-1', bucket: 1, buckets: 2, sha256: 'b'.repeat(64) };
    await fake.store.commit(await fake.routes.change({ pack, pages: [['usda-123']] }));
    await fake.store.commit(await fake.routes.change({ pack: next, pages: [['usda-123']] }));
    expect(await fake.routes.lookup('usda-123', [pack, next])).toEqual({ packs: [pack, next], complete: true });
    expect(await fake.routes.lookup('usda-123', [{ ...pack, sha256: 'c'.repeat(64) }])).toEqual({ packs: [], complete: false });
    await fake.store.commit(await fake.routes.change(undefined, [pack]));
    expect(await fake.routes.lookup('usda-123', [next])).toEqual({ packs: [next], complete: true });
  });
  it('does not mark a failed route transaction complete or mutate previous routes', async () => {
    const fake = setup(); await fake.store.commit(await fake.routes.change({ pack, pages: [['usda-123']] }));
    const next = { ...pack, sha256: 'b'.repeat(64) }; const change = await fake.routes.change({ pack: next, pages: [['usda-123']] }, [pack]);
    fake.fail(); await expect(fake.store.commit(change)).rejects.toThrow('quota');
    expect(await fake.routes.lookup('usda-123', [pack])).toEqual({ packs: [pack], complete: true });
    expect(await fake.routes.lookup('usda-123', [next])).toEqual({ packs: [], complete: false });
  });
});
