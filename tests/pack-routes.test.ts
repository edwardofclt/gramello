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
    commit: async (pairs: readonly (readonly [string, unknown])[]) => { if (fail) throw new Error('quota'); for (const [key, value] of pairs) values.set(key, structuredClone(value)); } };
  return { store, routes: createBrowserPackRoutes(store), fail: () => { fail = true; } };
}
describe('local USDA routes', () => {
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
