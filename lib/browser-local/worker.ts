import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createLocalRepository, type FoodCatalog, type LocalRepository } from '../../mobile/src/local/repository';
import { createLocalApi } from '../../mobile/src/local/api';
import { parseArchive } from '../../mobile/src/local/records';
import type { SqliteConnection } from '../../mobile/src/local/database';
import { createFoodLookup } from '../../mobile/src/catalog/lookup';
import { createCatalogReader, inspectCatalog } from '../../mobile/src/catalog/queries';
import { createCatalogUpdater, combineCatalogUpdaters, type UpdateState } from '../../mobile/src/catalog/updater';
import { createPackUpdater } from '../../mobile/src/catalog/packs';
import { createPackCatalog } from '../../mobile/src/catalog/pack-reader';
import { createBrowserPackStorage } from './packs';
import catalogConfig from '../../mobile/catalog-config.json';
import { openSnapshotStore, withSnapshot, type SnapshotStore } from './persistence';
import { openMemoryDatabase, type SqliteModule } from './sqlite';
import { createBrowserPackFiles } from './pack-files';
import type { BrowserPackFiles } from './pack-files';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { createBrowserCatalogSource, createBrowserFoodCatalog } from './food-catalog';

const scope = globalThis as unknown as { postMessage(message: WorkerResponse): void; onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null };
const emit = (message: WorkerResponse) => scope.postMessage(message);
const changed = () => emit({ event: 'change' });
const lock = async <T>(name: string, work: () => Promise<T>): Promise<T> => await navigator.locks.request(name, work);
type Database = ReturnType<typeof openMemoryDatabase>;
let storage: SnapshotStore;
let sqlite: SqliteModule;
let packFiles: BrowserPackFiles | undefined;

async function initialize() {
  if (!globalThis.indexedDB || !navigator.locks || !globalThis.crypto?.subtle || !globalThis.DecompressionStream) {
    throw new Error('This browser cannot safely store your diary offline. Use a current version of Chrome, Edge, Firefox, or Safari with site storage enabled.');
  }
  storage = await openSnapshotStore();
  // The package typings omit Emscripten's supported initialization options.
  const initializeSqlite = sqlite3InitModule as unknown as (options: { locateFile: () => string; print: () => void; printErr: () => void }) => Promise<SqliteModule>;
  sqlite = await initializeSqlite({ locateFile: () => '/offline/sqlite3.wasm', print: () => {}, printErr: () => {} });
  packFiles = createBrowserPackFiles(sqlite);
  // Opening the diary needs no network or catalog download.
  await withRepository(false, repo => repo.hasRecovery());
}
const ready = initialize();
// The initialization error is sent back to the caller of init, not as an
// unhandled rejection before the window has attached its message listener.
void ready.catch(() => {});

let bundled: { db: Database; reader: FoodCatalog; version: string } | undefined;
let bundledPending: Promise<typeof bundled> | undefined;
let active: { db: Database; reader: FoodCatalog; version: string } | undefined;
let catalogQueue: Promise<unknown> = Promise.resolve();
type BundleMetadata = { sha256: string; bytes: number };
const digest = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
function catalogTask<T>(work: () => Promise<T>): Promise<T> {
  const pending = catalogQueue.then(work);
  catalogQueue = pending.catch(() => {});
  return pending;
}
async function bundle() {
  if (bundled) return bundled;
  bundledPending ??= (async () => {
    const cached = await storage.read<Uint8Array<ArrayBuffer>>('catalog:bundled');
    const cachedMetadata = await storage.read<BundleMetadata>('catalog:bundled-meta');
    let expected: BundleMetadata | undefined;
    try {
      const response = await fetch('/offline/catalog-meta.json', { signal: AbortSignal.timeout(10_000) });
      if (response.ok) {
        const value = await response.json() as BundleMetadata;
        if (/^[a-f0-9]{64}$/.test(value.sha256) && Number.isInteger(value.bytes) && value.bytes >= 4096 && value.bytes <= 128 * 1024 * 1024) expected = value;
      }
    } catch { /* Previously verified foods remain available offline. */ }
    let bytes = cached, metadata = cachedMetadata;
    const cachedValid = cached && cachedMetadata && cached.length === cachedMetadata.bytes && await digest(cached) === cachedMetadata.sha256;
    if (!cachedValid || (expected && expected.sha256 !== cachedMetadata?.sha256)) {
      try {
        const response = await fetch('/offline/catalog.sqlite.gz', { signal: AbortSignal.timeout(120_000) });
        if (!response.ok || !response.body) throw new Error('The offline food catalog could not be downloaded. Your diary and custom foods remain available.');
        const downloaded = new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
        if (!expected || downloaded.length !== expected.bytes || await digest(downloaded) !== expected.sha256) throw new Error('The offline food catalog did not pass verification. Try reloading Gramello while online.');
        bytes = downloaded; metadata = expected;
      } catch (error) { if (!cachedValid) throw error; }
    }
    if (!bytes || !metadata) throw new Error('The offline food catalog is unavailable.');
    const db = openMemoryDatabase(sqlite, bytes);
    try {
      await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
      const info = await inspectCatalog(db);
      if (bytes !== cached) await storage.commit([['catalog:bundled', bytes], ['catalog:bundled-meta', metadata]]);
      bundled = { db, reader: createCatalogReader(work => work(db)), version: info.version };
      return bundled;
    } catch (error) { db.close(); throw error; }
  })().finally(() => { bundledPending = undefined; });
  return bundledPending;
}
async function catalogs(): Promise<FoodCatalog> {
  let seed: typeof bundled;
  let seedError: unknown;
  try { seed = await bundle(); } catch (error) { seedError = error; }
  const installed = await storage.read<string>('catalog:version');
  if (installed && installed !== active?.version) {
    const bytes = await storage.read<Uint8Array>('catalog:active');
    if (bytes) {
      let db: Database | undefined;
      try {
        db = openMemoryDatabase(sqlite, bytes);
        await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
        const info = await inspectCatalog(db);
        const previous = active;
        const installedDatabase = db;
        active = { db, reader: createCatalogReader(work => work(installedDatabase), seed?.reader), version: info.version };
        previous?.db.close();
      } catch (error) { db?.close(); catalogFailure(error); }
    }
  }
  if (active) return active.reader;
  if (seed) return seed.reader;
  throw seedError ?? new Error('The offline food catalog is unavailable.');
}
const packStorage = createBrowserPackStorage({
  store: { read: key => storage.read(key), commit: values => storage.commit(values) },
  open: bytes => openMemoryDatabase(sqlite, bytes), lock, manifestUrl: '/api/catalog/packs/manifest',
  files: () => packFiles,
});
const expandedCatalog = createPackCatalog(packStorage.list, packStorage.withReader, {
  getFood: async id => (await catalogs()).getFood(id),
  search: async (query, options) => (await catalogs()).search(query, options),
  searchWindow: async (query, options) => {
    const core = await catalogs();
    return core.searchWindow ? core.searchWindow(query, options) : { foods: await core.search(query, options), canExpand: false };
  },
  barcode: async (code, signal) => (await catalogs()).barcode(code, signal),
}, packStorage.routes);
const baseCatalog = createBrowserCatalogSource(async () => expandedCatalog, catalogTask, catalogFailure);
function catalogFailure(error: unknown) {
  emit({ event: 'catalog', status: { phase: 'error', error: error instanceof Error ? error.message : 'Offline foods are unavailable. Try updating the food catalog.' } });
}

let cacheConnection: Database | undefined;
let cachedLookup: FoodCatalog | undefined;
// The shared lookup retains native provider throttling between operations.
// Its connection points only at the database opened under the cross-tab lock.
const cacheProxy: SqliteConnection = {
  execAsync: sql => cacheConnection!.execAsync(sql),
  runAsync: (sql, ...params) => cacheConnection!.runAsync(sql, ...params),
  getAllAsync: (sql, ...params) => cacheConnection!.getAllAsync(sql, ...params),
  getFirstAsync: (sql, ...params) => cacheConnection!.getFirstAsync(sql, ...params),
};
function withCache<T>(write: boolean, work: (catalog: FoodCatalog) => Promise<T>) {
  return withSnapshot({ key: 'food-cache', store: storage, lock, open: bytes => openMemoryDatabase(sqlite, bytes), write,
    work: async db => {
      cacheConnection = db;
      try {
        // Initialize this snapshot's schema even after a previous attempt's
        // IndexedDB commit failed, while preserving the live rate limiter.
        const initialized = await createFoodLookup(baseCatalog, cacheProxy);
        cachedLookup ??= initialized;
        return await work(cachedLookup);
      }
      finally { cacheConnection = undefined; }
    },
  });
}
const foodCatalog = createBrowserFoodCatalog(withCache);
function withRepository<T>(write: boolean, work: (repository: LocalRepository, db: Database, extra: Array<readonly [string, unknown]>) => Promise<T>) {
  return withSnapshot({ key: 'personal', store: storage, lock, open: bytes => openMemoryDatabase(sqlite, bytes), write,
    work: async (db, extra) => {
      // Once the user edits or replaces this diary it belongs to the browser,
      // even if an imported archive is empty. Never bootstrap hosted data later.
      if (write) extra.push(['hosted:migrated', true]);
      return work(await createLocalRepository(db, foodCatalog), db, extra);
    },
  });
}

const coreUpdater = createCatalogUpdater({
  async load() {
    const state = await storage.read<UpdateState>('catalog:update') ?? {};
    const version = await storage.read<string>('catalog:version') ?? bundled?.version;
    return state.version === version ? state : { ...state, version };
  },
  async save(state) { await storage.commit([['catalog:update', state]]); },
  async fetchManifest() {
    const response = await fetch('/api/catalog/manifest', { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error('Catalog updates are temporarily unavailable. Your downloaded foods are ready to use.');
    const text = await response.text();
    if (text.length > 32768) throw new Error('Catalog manifest is too large.');
    return JSON.parse(text);
  },
  async install(manifest) {
    const response = await fetch(`/api/catalog/download?${new URLSearchParams({ version: manifest.version, sha256: manifest.sha256 })}`, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error('The food catalog could not be downloaded.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== manifest.bytes) throw new Error('The catalog download is incomplete.');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== manifest.sha256) throw new Error('The catalog download did not pass verification.');
    const db = openMemoryDatabase(sqlite, bytes);
    try {
      await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
      await inspectCatalog(db, manifest);
      await lock('gramello:catalog', () => storage.commit([['catalog:active', bytes], ['catalog:version', manifest.version]]));
      // Readers use their old complete catalog until the durable replacement is
      // ready. The next queued read activates it and closes the old handle.
    } finally { db.close(); }
  },
}, catalogConfig.publicKey);
const updater = combineCatalogUpdaters(coreUpdater, createPackUpdater(packStorage, catalogConfig.publicKey));
updater.subscribe(() => emit({ event: 'catalog', status: updater.getStatus() }));

const readMethods = new Set(['getDay', 'getTrends', 'searchFoods', 'lookupBarcode', 'listMeals', 'getWaterDay', 'exportArchive', 'hasRecovery']);
const methods = new Set([...readMethods, 'saveGoals', 'addEntry', 'updateEntry', 'removeEntry', 'createFood', 'saveMeal', 'deleteMeal', 'addWater', 'removeWater', 'saveWaterGoal', 'importArchive', 'restorePrevious']);
const controllers = new Map<number, AbortController>();
async function dispatch(method: string, args: unknown[], signal: AbortSignal): Promise<unknown> {
  await ready;
  if (signal.aborted) throw new Error('Operation cancelled.');
  if (method === 'init') return { phase: 'ready' };
  if (method === 'catalog.check') { await updater.check(Boolean(args[0])); return updater.getStatus(); }
  if (method === 'needsHostedMigration') return withRepository(false, async repo => !await storage.read<boolean>('hosted:migrated') && (await repo.exportArchive()).records.length === 0);
  if (method === 'migrateHosted') {
    const archive = parseArchive(String(args[0]));
    const result = await withRepository(false, async (repo, _db, extra) => {
      if (await storage.read<boolean>('hosted:migrated')) return false;
      extra.push(['hosted:migrated', true]);
      if ((await repo.exportArchive()).records.length) return false;
      if (archive.records.length) await repo.importArchive(JSON.stringify(archive));
      return true;
    });
    if (result) changed();
    return result;
  }
  if (method === 'api') {
    const [path, options = {}] = args as [string, { method?: 'GET' | 'PUT' | 'POST' | 'DELETE'; body?: unknown }];
    const write = !!options.method && options.method !== 'GET';
    const value = await withRepository(write, repo => createLocalApi(repo)(path, { ...options, signal }));
    if (write) changed();
    return value;
  }
  if (!methods.has(method)) throw new Error('Unsupported local diary operation.');
  const write = !readMethods.has(method);
  const parameters = [...args];
  if (method === 'searchFoods') parameters[1] = { ...(parameters[1] as object ?? {}), signal };
  if (method === 'lookupBarcode') parameters[1] = signal;
  const value = await withRepository(write, repo => (repo[method as keyof LocalRepository] as (...parameters: unknown[]) => Promise<unknown>)(...parameters));
  if (write) changed();
  return value;
}
scope.onmessage = event => {
  const message = event.data;
  if ('cancel' in message) { controllers.get(message.cancel)?.abort(); return; }
  const controller = new AbortController(); controllers.set(message.id, controller);
  void dispatch(message.method, message.args, controller.signal).then(value => emit({ id: message.id, value }))
    .catch(error => emit({ id: message.id, error: error instanceof Error ? error.message : 'Your diary operation could not complete.' }))
    .finally(() => controllers.delete(message.id));
};
