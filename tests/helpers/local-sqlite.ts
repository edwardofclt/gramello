import { DatabaseSync } from 'node:sqlite';
import type { SqliteConnection } from '../../mobile/src/local/database';
export function testDatabase(path = ':memory:') {
  const raw = new DatabaseSync(path);
  const db: SqliteConnection = {
    async execAsync(sql) { raw.exec(sql); },
    async runAsync(sql, ...params) { const r = raw.prepare(sql).run(...params); return { changes: Number(r.changes) }; },
    async getAllAsync<T>(sql: string, ...params: (string | number | null)[]) { return raw.prepare(sql).all(...params) as T[]; },
    async getFirstAsync<T>(sql: string, ...params: (string | number | null)[]) { return (raw.prepare(sql).get(...params) ?? null) as T | null; },
  };
  return { db, raw };
}
