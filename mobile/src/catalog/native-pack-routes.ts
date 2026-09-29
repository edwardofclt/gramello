import * as SQLite from 'expo-sqlite';
import type { FoodPack } from './packs';
export function createNativePackRoutes(directory: string) {
  async function database<T>(work: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
    const db = await SQLite.openDatabaseAsync('usda-routes.sqlite', { useNewConnection: true }, directory);
    try {
      await db.execAsync(`CREATE TABLE IF NOT EXISTS pack_routes(food_id TEXT NOT NULL,pack_id TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(food_id,pack_id,sha256));
        CREATE TABLE IF NOT EXISTS indexed_packs(pack_id TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(pack_id,sha256));`);
      return await work(db);
    } finally { await db.closeAsync(); }
  }
  return {
    indexed: (pack: FoodPack) => database(async db => !!await db.getFirstAsync('SELECT 1 FROM indexed_packs WHERE pack_id=? AND sha256=?', pack.id, pack.sha256)),
    index: (pack: FoodPack, pages: string[][]) => database(async db => {
      await db.execAsync('BEGIN IMMEDIATE');
      try {
        for (const ids of pages) for (const id of ids) await db.runAsync('INSERT OR IGNORE INTO pack_routes VALUES(?,?,?)', id, pack.id, pack.sha256);
        await db.runAsync('INSERT OR IGNORE INTO indexed_packs VALUES(?,?)', pack.id, pack.sha256);
        await db.execAsync('COMMIT');
      } catch (error) { await db.execAsync('ROLLBACK'); throw error; }
    }),
    lookup: (id: string, installed: FoodPack[]) => database(async db => {
      const rows = await db.getAllAsync<{ pack_id: string; sha256: string }>('SELECT pack_id,sha256 FROM pack_routes WHERE food_id=?', id);
      const indexed = await db.getAllAsync<{ pack_id: string; sha256: string }>('SELECT pack_id,sha256 FROM indexed_packs');
      const matches = (rows: { pack_id: string; sha256: string }[], pack: FoodPack) => rows.some(row => row.pack_id === pack.id && row.sha256 === pack.sha256);
      return { packs: installed.filter(pack => matches(rows, pack)), complete: installed.filter(pack => pack.source === 'usda-branded').every(pack => matches(indexed, pack)) };
    }),
    retire: (keep: FoodPack[]) => database(async db => {
      const indexed = await db.getAllAsync<{ pack_id: string; sha256: string }>('SELECT pack_id,sha256 FROM indexed_packs');
      await db.execAsync('BEGIN IMMEDIATE');
      try {
        for (const row of indexed) if (!keep.some(pack => pack.id === row.pack_id && pack.sha256 === row.sha256)) {
          await db.runAsync('DELETE FROM pack_routes WHERE pack_id=? AND sha256=?', row.pack_id, row.sha256);
          await db.runAsync('DELETE FROM indexed_packs WHERE pack_id=? AND sha256=?', row.pack_id, row.sha256);
        }
        await db.execAsync('COMMIT');
      } catch (error) { await db.execAsync('ROLLBACK'); throw error; }
    }),
  };
}
