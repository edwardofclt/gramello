import { createPackSearchIndex } from '../../mobile/src/catalog/pack-search-index';
import { openMemoryDatabase, wrapSqliteDatabase, type SqliteModule } from './sqlite';
import type { SnapshotStore } from './persistence';
type Database = ReturnType<typeof openMemoryDatabase>;
export function createBrowserPackSearch(sqlite: () => SqliteModule, store: SnapshotStore) {
  let cached: { revision: string | undefined; db: Database } | undefined;
  const close = () => { cached?.db.close(); cached = undefined; };
  const index = createPackSearchIndex(async (write, work) => {
    const runtime = sqlite();
    const location = await store.read<'opfs' | 'indexeddb'>('packs:search-location');
    if (runtime.oo1.OpfsDb && location !== 'indexeddb') {
      const connection = new runtime.oo1.OpfsDb('/gramello-food-search.sqlite', 'c');
      const db = wrapSqliteDatabase(runtime, connection);
      try {
        await db.execAsync('PRAGMA trusted_schema=OFF; PRAGMA cache_size=-4096;');
        const result = await work(db);
        if (write && location !== 'opfs') await store.commit([['packs:search-location', 'opfs']]);
        return result;
      }
      finally { db.close(); }
    }
    // Snapshot fallback keeps one process-local reader. A tiny revision pointer
    // detects another tab's atomic replacement without loading all bytes again.
    const file = location === 'opfs' ? await (await (await navigator.storage.getDirectory()).getFileHandle('gramello-food-search.sqlite')).getFile() : undefined;
    const revision = file ? `opfs:${file.size}:${file.lastModified}` : await store.read<string>('packs:search-revision');
    if (!write && cached && cached.revision === revision) return work(cached.db);
    const bytes = file ? new Uint8Array(await file.arrayBuffer()) : await store.read<Uint8Array>('packs:search');
    const db = openMemoryDatabase(runtime, bytes);
    if (!write) {
      close(); cached = { revision, db };
      return work(db);
    }
    try {
      const result = await work(db);
      await store.commit([['packs:search', db.export()], ['packs:search-revision', crypto.randomUUID()], ['packs:search-location', 'indexeddb']]);
      close(); return result;
    } finally { db.close(); }
  });
  return { ...index, close, async reset() {
    close();
    if (typeof globalThis.navigator?.storage?.getDirectory === 'function') {
      const directory = await navigator.storage.getDirectory();
      for (const name of ['gramello-food-search.sqlite', 'gramello-food-search.sqlite-journal']) {
        try { await directory.removeEntry(name); }
        catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
      }
    }
    await store.commit([['packs:search', undefined], ['packs:search-revision', crypto.randomUUID()], ['packs:search-location', undefined]]);
  } };
}
