import sqlite3Init from '@sqlite.org/sqlite-wasm';
import { createBrowserPackStorage } from '../../lib/browser-local/packs';
import { createBrowserPackSearch } from '../../lib/browser-local/pack-search';
import { createBrowserPackFiles } from '../../lib/browser-local/pack-files';
import { createBrowserPackRoutes } from '../../lib/browser-local/pack-routes';
import { openSnapshotStore } from '../../lib/browser-local/persistence';
import { openMemoryDatabase, type SqliteModule } from '../../lib/browser-local/sqlite';
import { createPackCatalog } from '../../mobile/src/catalog/pack-reader';
import { createPackUpdater } from '../../mobile/src/catalog/packs';
import { verifyPackManifest } from '../../mobile/src/catalog/packs';
const metrics = { hashes: 0, fileReads: 0, snapshotReads: 0, open: 0, peak: 0 };
const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
crypto.subtle.digest = (algorithm, data) => { metrics.hashes++; return originalDigest(algorithm, data); };
const sqlite = await (sqlite3Init as unknown as (options: unknown) => Promise<SqliteModule>)({ locateFile: () => '/offline/sqlite3.wasm', print: () => {}, printErr: () => {} });
const store = await openSnapshotStore();
const searchIndex = createBrowserPackSearch(() => sqlite, store);
let failCommit = false, fileEnabled = true;
const track = <T extends { close(): void }>(db: T): T => {
  metrics.open++; metrics.peak = Math.max(metrics.peak, metrics.open);
  const close = db.close.bind(db); db.close = () => { close(); metrics.open--; }; return db;
};
const realFiles = createBrowserPackFiles(sqlite);
const files = realFiles ? { ...realFiles,
  async read(pack: Parameters<typeof realFiles.read>[0]) { metrics.fileReads++; return realFiles.read(pack); },
  async open(pack: Parameters<typeof realFiles.open>[0]) { return track(await realFiles.open(pack)); },
  async retire(keep: Parameters<typeof realFiles.retire>[0]) {
    try { await realFiles.retire(keep); } catch (error) { throw new Error('File retirement: ' + String(error)); }
  },
} : undefined;
const storage = createBrowserPackStorage({
  searchIndex,
  store: { async read<T>(key: string) { if (/^packs:(?:off|usda-branded)-\d/.test(key)) metrics.snapshotReads++; return store.read<T>(key); },
    readMany: keys => store.readMany!(keys),
    async commit(values) { if (failCommit) throw new DOMException('Injected transaction quota failure', 'QuotaExceededError'); await store.commit(values); } },
  files: () => fileEnabled ? files : undefined,
  open: bytes => track(openMemoryDatabase(sqlite, bytes)),
  lock: async (name, work) => await navigator.locks.request(name, work), manifestUrl: '/api/catalog/packs/manifest',
});
const core = { getFood: async () => null, search: async () => [], barcode: async () => null };
const catalog = createPackCatalog(storage.list, storage.withReader, core, storage.routes, storage.search);
const fixture = await (await fetch('/fixture.json')).json();
const updater = createPackUpdater(storage, fixture.publicKey);
const methods: Record<string, (value: any) => Promise<unknown>> = {
  batchRoutes: async () => {
    const pack = { ...verifyPackManifest(await storage.fetchManifest(), fixture.publicKey).packs.find(pack => pack.source === 'usda-branded')!, id: 'usda-batch-probe', sha256: 'c'.repeat(64) };
    const ids = Array.from({ length: 1001 }, (_, i) => `usda-probe-${i}`), pages = [ids.slice(0, 500), ids.slice(500, 1000), ids.slice(1000)];
    const counts = { readonly: 0, readwrite: 0 }, transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
      counts[args[1] === 'readwrite' ? 'readwrite' : 'readonly']++;
      return transaction.apply(this, args);
    };
    try {
      const routes = createBrowserPackRoutes(store);
      await store.commit(await routes.change({ pack, pages })); const activation = { ...counts };
      const installed = await routes.lookup(ids[1000], [pack]);
      Object.assign(counts, { readonly: 0, readwrite: 0 });
      const next = { ...pack, sha256: 'd'.repeat(64) };
      await store.commit(await routes.change({ pack: next, pages }, [pack])); const replacement = { ...counts };
      const replaced = await routes.lookup(ids[0], [next]);
      Object.assign(counts, { readonly: 0, readwrite: 0 });
      await store.commit(await routes.change(undefined, [next])); const retirement = { ...counts };
      const retired = await routes.lookup(ids[0], [next]);
      return { activation, replacement, retirement, installed: installed.packs.length, replaced: replaced.packs.length, retired };
    } finally { IDBDatabase.prototype.transaction = transaction; }
  },
  batchRead: async () => {
    await store.commit([['batch:first', 'first'], ['batch:last', 'last']]);
    const values = await store.readMany!<string>(['batch:last', 'batch:missing', 'batch:first', 'batch:last']);
    const empty = await store.readMany!([]);
    const get = IDBObjectStore.prototype.get; let readSucceeded = false;
    IDBObjectStore.prototype.get = function (...args: Parameters<typeof get>) {
      const request = get.apply(this, args);
      request.addEventListener('success', () => { readSucceeded = true; request.transaction!.abort(); });
      return request;
    };
    let aborted = false;
    try { await store.readMany!(['batch:first']); } catch { aborted = true; }
    finally { IDBObjectStore.prototype.get = get; }
    return { values, empty, readSucceeded, aborted };
  },
  locks: async () => navigator.locks.query(),
  files: async () => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('gramello-food-packs', { create: true });
    const names: string[] = []; for await (const name of (directory as any).keys()) names.push(name); return names;
  },
  stageNever: async () => storage.exclusive!(async () => {
    const pack = verifyPackManifest(await storage.fetchManifest(), fixture.publicKey).packs[0];
    return realFiles!.stage(pack, new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4096)); } })));
  }),
  info: async () => ({ isolated: crossOriginIsolated, direct: realFiles?.direct, entries: await store.read('packs:index'), metrics }),
  configure: async value => { fileEnabled = value.files !== false; failCommit = !!value.failCommit; return true; },
  update: async () => { await updater.check(true); return updater.getStatus(); },
  search: async () => catalog.searchWindow!('al fresco apple maple sausage'),
  get: async id => catalog.getFood(id),
  barcode: async () => catalog.barcode('030771094625'),
  resetMetrics: async () => { Object.assign(metrics, { hashes: 0, fileReads: 0, snapshotReads: 0, open: 0, peak: 0 }); return true; },
  clearSearchIndex: async () => { await navigator.locks.request('gramello:food-packs', () => searchIndex.reset()); return true; },
  prepareSearch: async () => { await storage.prepareSearch?.(); return true; },
  legacy: async () => {
    fileEnabled = false; await updater.check(true);
    const packs = await storage.list();
    await store.commit([['packs:index', packs], ...packs.map(pack => ['packs:previous:' + pack.id, new Uint8Array(4096)] as const)]);
    return packs;
  },
  values: async id => ({ bytes: await store.read('packs:' + id), previous: await store.read('packs:previous:' + id) }),
  corrupt: async () => {
    const pack = (await storage.list()).find(pack => pack.source === 'off')!;
    const root = await navigator.storage.getDirectory(), directory = await root.getDirectoryHandle('gramello-food-packs');
    const file = await directory.getFileHandle(`pack-${pack.sha256}.sqlite`) as FileSystemFileHandle & { createSyncAccessHandle(): Promise<any> };
    const handle = await file.createSyncAccessHandle();
    try { handle.write(new Uint8Array([255]), { at: 0 }); await handle.flush(); } finally { await handle.close(); }
    return pack;
  },
  unavailable: async () => { fileEnabled = false; return true; },
};
self.onmessage = async ({ data }) => {
  try { self.postMessage({ id: data.id, result: await methods[data.method](data.value) }); }
  catch (error) { self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) }); }
};
self.postMessage({ ready: true });
