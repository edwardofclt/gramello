export type SqlValue = string | number | null;
export interface SqliteConnection {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
}
// All operations on one connection share a queue, including exports and restore.
// A transaction must never accidentally absorb an unrelated UI write.
const queues = new WeakMap<SqliteConnection, Promise<unknown>>();
export function serialized<T>(db: SqliteConnection, work: () => Promise<T>): Promise<T> {
  const result = (queues.get(db) ?? Promise.resolve()).then(work);
  queues.set(db, result.catch(() => {}));
  return result;
}
export async function transaction<T>(db: SqliteConnection, work: () => Promise<T>): Promise<T> {
  await db.execAsync('BEGIN IMMEDIATE');
  try { const result = await work(); await db.execAsync('COMMIT'); return result; }
  catch (error) { await db.execAsync('ROLLBACK'); throw error; }
}
