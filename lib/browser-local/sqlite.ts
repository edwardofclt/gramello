import type { SqliteConnection, SqlValue } from '../../mobile/src/local/database';

export interface MemoryDatabase {
  pointer: number;
  exec(sql: string | { sql: string; bind?: SqlValue[] }): unknown;
  selectObjects(sql: string, params?: SqlValue[]): object[];
  changes(): number;
  close(): void;
  checkRc(result: number): unknown;
}
export interface SqliteModule {
  oo1: { DB: new (filename?: string) => MemoryDatabase; OpfsDb?: new (filename: string, flags: string) => MemoryDatabase };
  wasm: { heap8u(): Uint8Array };
  capi: {
    sqlite3_malloc(bytes: number): number;
    sqlite3_free(pointer: number): void;
    sqlite3_deserialize(db: number, name: string, data: number, size: bigint, capacity: bigint, flags: number): number;
    sqlite3_js_db_export(db: number): Uint8Array;
    SQLITE_DESERIALIZE_FREEONCLOSE: number;
    SQLITE_DESERIALIZE_RESIZEABLE: number;
  };
}

export function openMemoryDatabase(sqlite: SqliteModule, bytes?: Uint8Array): SqliteConnection & {
  export(): Uint8Array;
  close(): void;
} {
  const db = new sqlite.oo1.DB(':memory:');
  try {
    if (bytes?.length) {
      const pointer = sqlite.capi.sqlite3_malloc(bytes.length);
      if (!pointer) throw new Error('There is not enough browser memory to open this diary.');
      sqlite.wasm.heap8u().set(bytes, pointer);
      const result = sqlite.capi.sqlite3_deserialize(db.pointer, 'main', pointer, BigInt(bytes.length), BigInt(bytes.length),
        sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE);
      // FREEONCLOSE also makes SQLite free the buffer when this call fails.
      db.checkRc(result);
    }
    return wrapSqliteDatabase(sqlite, db);
  } catch (error) {
    db.close();
    throw error;
  }
}
export function wrapSqliteDatabase(sqlite: SqliteModule, db: MemoryDatabase): SqliteConnection & { export(): Uint8Array; close(): void } {
  return {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...params) { db.exec({ sql, bind: params }); return { changes: Number(db.changes()) }; },
    async getAllAsync<T>(sql: string, ...params: SqlValue[]) { return db.selectObjects(sql, params) as T[]; },
    async getFirstAsync<T>(sql: string, ...params: SqlValue[]) { return (db.selectObjects(sql, params)[0] ?? null) as T | null; },
    export: () => sqlite.capi.sqlite3_js_db_export(db.pointer), close: () => db.close(),
  };
}
