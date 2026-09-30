import { consumeBoundedResponse } from '../../mobile/src/catalog/downloads';
import { packSchema, inspectFoodPack, type FoodPack } from '../../mobile/src/catalog/packs';
import type { PackFileStamp } from '../../mobile/src/catalog/pack-verification';
import type { SqliteConnection } from '../../mobile/src/local/database';
import { openMemoryDatabase, wrapSqliteDatabase, type SqliteModule } from './sqlite';
export interface BrowserPackFiles {
  readonly direct?: boolean;
  // Caller owns both the update lease and reader lock: no live transfer/migration.
  recover?(): Promise<void>;
  stat(pack: FoodPack): Promise<PackFileStamp | null>;
  read(pack: FoodPack): Promise<Uint8Array<ArrayBuffer>>;
  stage(pack: FoodPack, response: Response): Promise<string>;
  activate(pack: FoodPack, temporary: string): Promise<void>;
  open(pack: FoodPack): Promise<SqliteConnection & { close(): void }>;
  removeTemporary(path: string): Promise<void>;
  retire(keep: FoodPack[]): Promise<void>;
}
export const packFileName = (pack: FoodPack) => `pack-${packSchema.parse(pack).sha256}.sqlite`;
const temporaryName = (name: string) => {
  if (!/^partial-[a-f0-9]{64}-[a-f0-9-]+\.sqlite$/.test(name)) throw new Error('Invalid temporary pack path.');
  return name;
};
type SyncHandle = { write(bytes: Uint8Array, options?: { at: number }): number; truncate(size: number): void | Promise<void>; flush(): void | Promise<void>; close(): void | Promise<void> };
type SyncFile = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncHandle> };
const digest = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
export function createBrowserPackFiles(sqlite: SqliteModule): BrowserPackFiles | undefined {
  if (!globalThis.navigator?.storage?.getDirectory) return undefined;
  const direct = !!sqlite.oo1.OpfsDb;
  let pendingDirectory: Promise<FileSystemDirectoryHandle> | undefined;
  const directory = () => pendingDirectory ??= navigator.storage.getDirectory()
    .then(root => root.getDirectoryHandle('gramello-food-packs', { create: true }))
    .catch(error => { pendingDirectory = undefined; throw error; });
  const read = async (name: string): Promise<Uint8Array<ArrayBuffer>> => {
    const file = await (await (await directory()).getFileHandle(name)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  };
  const remove = async (name: string) => { try { await (await directory()).removeEntry(name); } catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; } };
  const write = async (name: string, bytes: Uint8Array<ArrayBuffer>) => {
    const file = await (await directory()).getFileHandle(name, { create: true }) as SyncFile;
    const handle = await file.createSyncAccessHandle();
    try {
      await handle.truncate(0);
      let offset = 0;
      while (offset < bytes.length) { const written = handle.write(bytes.subarray(offset), { at: offset }); if (!written) throw new Error('Pack file write failed.'); offset += written; }
      await handle.flush();
    } finally { await handle.close(); }
  };
  const result: BrowserPackFiles = {
    direct,
    async recover() {
      const dir = await directory();
      for await (const name of (dir as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }).keys()) {
        if (/^partial-[a-f0-9]{64}-[a-f0-9-]+\.sqlite$/.test(name)) await dir.removeEntry(name);
      }
    },
    async stat(pack) {
      try { const file = await (await (await directory()).getFileHandle(packFileName(pack))).getFile(); return { bytes: file.size, modifiedAt: file.lastModified }; }
      catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return null; throw error; }
    },
    read: pack => read(packFileName(pack)),
    async stage(pack, response) {
      packSchema.parse(pack);
      const name = `partial-${pack.sha256}-${crypto.randomUUID()}.sqlite`;
      try {
        const file = await (await directory()).getFileHandle(name, { create: true }) as SyncFile;
        const handle = await file.createSyncAccessHandle(); let offset = 0;
        try {
          await consumeBoundedResponse(response, { maxBytes: pack.bytes, exactBytes: pack.bytes }, bytes => {
            let cursor = 0;
            while (cursor < bytes.length) { const written = handle.write(bytes.subarray(cursor), { at: offset }); if (!written) throw new Error('Pack file write failed.'); cursor += written; offset += written; }
          }); await handle.flush();
        } finally { await handle.close(); }
        return name;
      } catch (error) { await remove(name).catch(() => {}); throw error; }
    },
    // Called while owning the reader lock: temporary inspection cannot overlap a reader.
    async activate(pack, temporary) {
      const bytes = await read(temporaryName(temporary));
      if (bytes.length !== pack.bytes || await digest(bytes) !== pack.sha256) throw new Error('The food pack did not pass verification.');
      const db = openMemoryDatabase(sqlite, bytes);
      try { await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;'); await inspectFoodPack(db, pack); } finally { db.close(); }
      const name = packFileName(pack);
      const stamp = await result.stat(pack);
      if (stamp?.bytes === pack.bytes && await digest(await result.read(pack)) === pack.sha256) return;
      await write(name, bytes);
      const destination = await read(name);
      if (destination.length !== pack.bytes || await digest(destination) !== pack.sha256) throw new Error('The food pack did not pass verification.');
    },
    async open(pack) {
      if (!direct) return openMemoryDatabase(sqlite, await result.read(pack));
      const db = new sqlite.oo1.OpfsDb!(`/gramello-food-packs/${packFileName(pack)}`, 'r');
      const connection = wrapSqliteDatabase(sqlite, db);
      try { await connection.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-2048;'); return connection; }
      catch (error) { connection.close(); throw error; }
    },
    removeTemporary: async path => remove(temporaryName(path)),
    async retire(keep) {
      const names = new Set(keep.map(packFileName)), dir = await directory();
      for await (const name of (dir as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> }).keys()) {
        if (/^pack-[a-f0-9]{64}\.sqlite$/.test(name) && !names.has(name)) await dir.removeEntry(name);
      }
    },
  };
  return result;
}
