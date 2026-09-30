import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testDatabase } from './helpers/local-sqlite';
import type { FoodPack } from '../mobile/src/catalog/packs';

const bridge = vi.hoisted(() => ({ runs: [] as { sql: string; params: (string | number | null)[] }[], routeWrites: 0, failAt: 0, opened: 0, closed: 0 }));
// Only the unavailable Expo bridge is substituted; all SQL and transactions
// execute against a real, disposable SQLite file.
vi.mock('../mobile/node_modules/expo-sqlite/build/index.js', async () => ({
  openDatabaseAsync: async (name: string, _options: unknown, directory: string) => {
    const { db, raw } = (await import('./helpers/local-sqlite')).testDatabase(join(directory, name)); bridge.opened++;
    return { ...db,
      async runAsync(sql: string, ...params: (string | number | null)[]) {
        bridge.runs.push({ sql, params });
        if (sql.startsWith('INSERT OR IGNORE INTO pack_routes') && ++bridge.routeWrites === bridge.failAt) throw new Error('Injected route write failure');
        return db.runAsync(sql, ...params);
      },
      async closeAsync() { raw.close(); bridge.closed++; },
    };
  },
}));
import { createNativePackRoutes } from '../mobile/src/catalog/native-pack-routes';

const pack: FoodPack = { schemaVersion: 1, id: 'usda-branded-1-0', source: 'usda-branded', market: 'US', license: 'CC0-1.0', buckets: 1, bucket: 0,
  version: 'v1', url: 'https://example.org/p.sqlite', sha256: 'a'.repeat(64), bytes: 4096, count: 1001 };
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'gramello-route-batches-'));
  Object.assign(bridge, { runs: [], routeWrites: 0, failAt: 0, opened: 0, closed: 0 });
});
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });
const ids = Array.from({ length: 1001 }, (_, i) => `usda-${String(i).padStart(6, '0')}`);

describe('native USDA route batches', () => {
  it('persists every route with one bounded insert per page and one completion write', async () => {
    await createNativePackRoutes(directory).index(pack, [ids.slice(0, 500), ids.slice(500, 1000), ids.slice(1000)]);
    expect(bridge.runs).toHaveLength(4);
    expect(bridge.runs.slice(0, 3).map(run => run.params.length)).toEqual([502, 502, 3]);
    const { raw } = testDatabase(join(directory, 'usda-routes.sqlite'));
    try {
      expect(raw.prepare('SELECT food_id FROM pack_routes WHERE pack_id=? AND sha256=? ORDER BY food_id').all(pack.id, pack.sha256).map(row => row.food_id)).toEqual(ids);
    } finally { raw.close(); }
    const reopened = createNativePackRoutes(directory);
    expect(await reopened.indexed(pack)).toBe(true);
    expect(await reopened.lookup('usda-001000', [pack])).toEqual({ packs: [pack], complete: true });
    expect(bridge.opened).toBe(bridge.closed);
  });
  it('bounds oversized pages, skips empty pages and binds identities rather than interpolating them', async () => {
    const quoted = "usda-'; DROP TABLE pack_routes; --";
    const routes = createNativePackRoutes(directory);
    await routes.index(pack, [[], [...ids, quoted], ['usda-000000']]);
    expect(bridge.runs).toHaveLength(5);
    expect(bridge.runs.slice(0, 4).map(run => run.params.length)).toEqual([502, 502, 4, 3]);
    expect(bridge.runs.every(run => !run.sql.includes(quoted))).toBe(true);
    expect(await routes.lookup(quoted, [pack])).toEqual({ packs: [pack], complete: true });
    const { raw } = testDatabase(join(directory, 'usda-routes.sqlite'));
    try { expect(raw.prepare('SELECT count(*) AS total FROM pack_routes').get()?.total).toBe(1002); } finally { raw.close(); }
  });
  it('rolls back earlier pages and the completion marker if a later page fails', async () => {
    const routes = createNativePackRoutes(directory); await routes.index(pack, [['usda-existing']]);
    bridge.routeWrites = 0; bridge.failAt = 2;
    const next = { ...pack, sha256: 'b'.repeat(64) };
    await expect(routes.index(next, [ids.slice(0, 500), ids.slice(500)])).rejects.toThrow('Injected route write failure');
    expect(await routes.indexed(next)).toBe(false); expect(await routes.indexed(pack)).toBe(true);
    expect(await routes.lookup('usda-existing', [pack])).toEqual({ packs: [pack], complete: true });
    const { raw } = testDatabase(join(directory, 'usda-routes.sqlite'));
    try { expect(raw.prepare('SELECT count(*) AS total FROM pack_routes').get()?.total).toBe(1); } finally { raw.close(); }
    expect(bridge.opened).toBe(bridge.closed);
  });
});
