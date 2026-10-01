import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/local-sqlite';
import { createLocalRepository } from '../mobile/src/local/repository';

const native = vi.hoisted(() => ({
  openDatabase: vi.fn(), downloadAsset: vi.fn(), copy: vi.fn(), bytes: vi.fn(),
  digest: vi.fn(), inspect: vi.fn(), existingFiles: new Set<string>(), receipts: new Map<string, string>(), modified: 100, assetHash: 'cafe', directoryEntries: [] as unknown[],
}));
vi.mock('../mobile/node_modules/expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) }));
vi.mock('../mobile/node_modules/expo-sqlite', () => ({ openDatabaseAsync: native.openDatabase }));
vi.mock('../mobile/node_modules/expo-asset', () => ({ Asset: { fromModule: () => ({ hash: native.assetHash, downloadAsync: native.downloadAsset }) } }));
vi.mock('../mobile/node_modules/expo-file-system', () => ({
  Paths: { cache: 'file:///cache', document: 'file:///documents', availableDiskSpace: 10 ** 10 },
  Directory: class {
    uri: string;
    constructor(base: string, name: string) { this.uri = `${base}/${name}`; }
    create() {}
    list() { return native.directoryEntries; }
  },
  File: class {
    name: string;
    uri: string;
    constructor(base: string | { uri: string }, name = '') {
      this.uri = `${typeof base === 'string' ? base : base.uri}/${name}`;
      this.name = name || this.uri.split('/').at(-1)!;
    }
    get exists() { return native.existingFiles.has(this.name); }
    get size() { return native.receipts.get(this.name)?.length ?? 4096; }
    info() { return { modificationTime: native.modified }; }
    async text() { return native.receipts.get(this.name) ?? ''; }
    write(text: string) { native.receipts.set(this.name, text); native.existingFiles.add(this.name); }
    copy = native.copy;
    bytes = native.bytes;
    delete() { native.existingFiles.delete(this.name); }
  },
}));
vi.mock('../mobile/node_modules/expo-crypto', () => ({ randomUUID, digest: native.digest, CryptoDigestAlgorithm: { SHA256: 'SHA256' } }));
vi.mock('../mobile/node_modules/expo-sharing', () => ({}));
vi.mock('../mobile/node_modules/expo-document-picker', () => ({}));
// Segment imports a React Native bridge; diary logic remains real.
vi.mock('../mobile/src/analytics/client', () => ({ trackEvent: vi.fn() }));
vi.mock('../mobile/src/catalog/queries', async importOriginal => {
  const original = await importOriginal<typeof import('../mobile/src/catalog/queries')>();
  return { ...original, inspectCatalog: native.inspect };
});

let personal: ReturnType<typeof testDatabase>;
let cache: ReturnType<typeof testDatabase>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  native.existingFiles.clear();
  native.receipts.clear();
  native.modified = 100;
  native.directoryEntries = [];
  personal = testDatabase();
  cache = testDatabase();
  // All expensive native catalog operations hang indefinitely. A regression
  // must fail promptly rather than wait for the platform's download timeout.
  const stalled = () => new Promise<never>(() => {});
  native.downloadAsset.mockImplementation(stalled);
  native.copy.mockImplementation(stalled);
  native.bytes.mockImplementation(stalled);
  native.digest.mockImplementation(stalled);
  native.inspect.mockImplementation(stalled);
  native.openDatabase.mockImplementation((name: string) => {
    if (name === 'gramello-personal.sqlite') return Promise.resolve(personal.db);
    if (name === 'gramello-food-cache.sqlite') return Promise.resolve(cache.db);
    return stalled();
  });
});
const catalogs: ReturnType<typeof testDatabase>[] = [];
afterEach(() => { vi.unstubAllGlobals(); personal.raw.close(); cache.raw.close(); for (const db of catalogs.splice(0)) db.raw.close(); });

async function beforeCatalogReady<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Diary startup waited for catalog preparation')), 1000);
    })]);
  } finally { clearTimeout(timer); }
}

it.each([false, true])('opens the saved diary without catalog work (full catalog installed: %s)', async installed => {
  const repository = await createLocalRepository(personal.db, {
    getFood: async () => null, search: async () => [], barcode: async () => null,
  });
  const goals = { calories: 2100, protein: 120, carbs: 250, fat: 70 };
  await repository.saveGoals(goals);
  const entry = {
    id: 'saved-entry', date: '2026-09-29', createdAt: '2026-09-29T12:00:00Z', meal: 'Lunch',
    name: 'Saved food', source: 'Downloaded catalog', sourceId: 'off-123', quantity: 1,
    unit: 'serving', grams: 100, calories: 200, protein: 15, carbs: 20, fat: 7,
  };
  await repository.importArchive(JSON.stringify({ format: 'gramello', version: 1, exportedAt: '2026-09-29T12:00:00Z', records: [
    { kind: 'goals', id: 'default', date: null, value: goals },
    { kind: 'entry', id: entry.id, date: entry.date, value: entry },
  ] }));
  await personal.db.execAsync('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  if (installed) {
    await personal.db.runAsync('INSERT INTO app_meta VALUES(?,?)', 'catalogFile', JSON.stringify('catalog-installed.sqlite'));
    const packs = Array.from({ length: 256 }, (_, bucket) => ({
      schemaVersion: 1, id: `off-256-${bucket}`, version: '2026-09', source: 'off', market: 'US',
      license: 'ODbL-1.0', url: `https://example.com/${bucket}.sqlite`, sha256: bucket.toString(16).padStart(64, '0'),
      bytes: 4096, count: 100000, bucket, buckets: 256,
    }));
    await personal.db.runAsync('INSERT INTO app_meta VALUES(?,?)', 'foodPackIndex', JSON.stringify({ active: packs, previous: [] }));
    native.existingFiles.add('catalog-installed.sqlite');
    for (const pack of packs) native.existingFiles.add(`pack-${pack.sha256}.sqlite`);
  }
  const { getLocalRuntime } = await import('../mobile/src/local/native');
  const runtime = await beforeCatalogReady(getLocalRuntime());
  const day = await beforeCatalogReady(runtime.api('/api/day?date=2026-09-29'));
  expect(day).toEqual({ goals, entries: [entry] });
  expect(native.openDatabase.mock.calls.map(([name]) => name)).toEqual([
    'gramello-personal.sqlite', 'gramello-food-cache.sqlite',
  ]);
  for (const operation of [native.downloadAsset, native.copy, native.bytes, native.digest, native.inspect]) {
    expect(operation).not.toHaveBeenCalled();
  }
});

async function installedCore(contentAddressed = false) {
  const sha = 'ab'.repeat(32), name = contentAddressed ? `catalog-${sha}.sqlite` : 'catalog-legacy.sqlite';
  const core = testDatabase();
  catalogs.push(core);
  const food = {
    id: 'usda-test', name: 'Installed oats', source: 'USDA', servingLabel: '100 g', servingGrams: 100,
    calories: 200, protein: 15, carbs: 20, fat: 7,
  };
  await core.db.execAsync(`PRAGMA user_version=1;
    CREATE TABLE catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO catalog_meta VALUES('version','test-v1');
    CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT NOT NULL,food TEXT NOT NULL);
    CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand);
    CREATE TABLE barcodes(code TEXT NOT NULL,food_id TEXT NOT NULL,PRIMARY KEY(code,food_id));`);
  await core.db.runAsync('INSERT INTO foods VALUES(?,?,?)', food.id, food.name, JSON.stringify(food));
  await core.db.runAsync('INSERT INTO food_search VALUES(?,?,?)', food.id, food.name, '');
  await personal.db.execAsync('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  await personal.db.runAsync('INSERT INTO app_meta VALUES(?,?)', 'catalogFile', JSON.stringify(name));
  native.existingFiles.add(name);
  native.bytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
  native.digest.mockResolvedValue(new Uint8Array(32).fill(0xab).buffer);
  const original = await vi.importActual<typeof import('../mobile/src/catalog/queries')>('../mobile/src/catalog/queries');
  native.inspect.mockImplementation(original.inspectCatalog);
  native.openDatabase.mockImplementation(async (databaseName: string) => {
    if (databaseName === 'gramello-personal.sqlite') return personal.db;
    if (databaseName === 'gramello-food-cache.sqlite') return cache.db;
    if (databaseName === name) return { ...core.db, closeAsync: vi.fn() };
    throw new Error(`Unexpected database ${databaseName}`);
  });
  const getRuntime = async () => {
    const { getLocalRuntime } = await import('../mobile/src/local/native');
    return beforeCatalogReady(getLocalRuntime());
  };
  const logFood = async (runtime: Awaited<ReturnType<typeof getRuntime>>) => runtime.repository.addEntry({
    sourceId: food.id, date: '2026-09-29', meal: 'Lunch', quantity: 1, unit: 'serving',
  });
  return { name, food, getRuntime, logFood, db: core.db };
}

it.each([false, true])('reads activated core catalogs across launches without repeating download validation (content addressed: %s)', async contentAddressed => {
  const core = await installedCore(contentAddressed);
  let runtime = await core.getRuntime();
  expect(native.inspect).not.toHaveBeenCalled();
  expect(native.digest).not.toHaveBeenCalled();
  expect(await beforeCatalogReady(core.logFood(runtime))).toMatchObject({ name: core.food.name, calories: 200 });
  expect(native.inspect).not.toHaveBeenCalled();
  expect(native.digest).not.toHaveBeenCalled();
  expect(native.bytes).not.toHaveBeenCalled();

  // Recreate the process-level runtime while retaining the native files and DBs.
  vi.resetModules();
  vi.clearAllMocks();
  runtime = await core.getRuntime();
  expect(await beforeCatalogReady(core.logFood(runtime))).toMatchObject({ name: core.food.name, calories: 200 });
  expect(native.inspect).not.toHaveBeenCalled();
  expect(native.digest).not.toHaveBeenCalled();
  expect(native.bytes).not.toHaveBeenCalled();
  expect(native.downloadAsset).not.toHaveBeenCalled();
  expect(native.copy).not.toHaveBeenCalled();
});

it.each([
  { validation: 0, identity: 'same' },
  { validation: 1, identity: 'different' },
])('ignores obsolete core receipts during lookup: %j', async receipt => {
  const core = await installedCore(true);
  native.existingFiles.add(`${core.name}.verified.json`);
  native.receipts.set(`${core.name}.verified.json`, JSON.stringify({ ...receipt, identity: receipt.identity === 'same' ? core.name : receipt.identity, bytes: 4096, modified: 100, version: 'obsolete-version' }));
  expect(await beforeCatalogReady(core.logFood(await core.getRuntime()))).toMatchObject({ name: core.food.name });
  expect(native.inspect).not.toHaveBeenCalled();
  expect(native.digest).not.toHaveBeenCalled();
});

it('rejects changed core files without revalidating them on lookup', async () => {
  const core = await installedCore(true);
  native.existingFiles.add(`${core.name}.verified.json`);
  native.receipts.set(`${core.name}.verified.json`, JSON.stringify({ validation: 1, identity: core.name, bytes: 4096, modified: 100, version: 'test-v1' }));
  native.modified++;
  await expect(beforeCatalogReady(core.logFood(await core.getRuntime()))).rejects.toThrow();
  expect(native.inspect).not.toHaveBeenCalled();
  expect(native.digest).not.toHaveBeenCalled();
  expect(native.bytes).not.toHaveBeenCalled();
});

it('opens the diary when an installed catalog has been removed by the OS cache', async () => {
  await personal.db.execAsync('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  await personal.db.runAsync('INSERT INTO app_meta VALUES(?,?)', 'catalogFile', JSON.stringify('catalog-missing.sqlite'));
  const { getLocalRuntime } = await import('../mobile/src/local/native');
  const runtime = await beforeCatalogReady(getLocalRuntime());
  expect(await beforeCatalogReady(runtime.api('/api/day?date=2026-09-29'))).toMatchObject({ entries: [] });
  expect(native.downloadAsset).not.toHaveBeenCalled();
  expect(native.inspect).not.toHaveBeenCalled();
});

async function installBundledFixture() {
  const core = await installedCore();
  const bundle = testDatabase();
  catalogs.push(bundle);
  const food = { ...core.food, id: 'usda-bundled', name: 'Bundled oats' };
  await bundle.db.execAsync(`PRAGMA user_version=1;
    CREATE TABLE catalog_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO catalog_meta VALUES('version','bundled-v1');
    CREATE TABLE foods(id TEXT PRIMARY KEY,name TEXT NOT NULL,food TEXT NOT NULL);
    CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED,name,brand);
    CREATE TABLE barcodes(code TEXT NOT NULL,food_id TEXT NOT NULL,PRIMARY KEY(code,food_id));`);
  await bundle.db.runAsync('INSERT INTO foods VALUES(?,?,?)', food.id, food.name, JSON.stringify(food));
  await bundle.db.runAsync('INSERT INTO food_search VALUES(?,?,?)', food.id, food.name, '');
  await bundle.db.runAsync('INSERT INTO barcodes VALUES(?,?)', '00012345678905', food.id);
  const open = native.openDatabase.getMockImplementation()!;
  native.openDatabase.mockImplementation((name: string, ...args: unknown[]) => name === 'starter-cafe.sqlite'
    ? Promise.resolve({ ...bundle.db, closeAsync: vi.fn() }) : open(name, ...args));
  native.downloadAsset.mockResolvedValue({ uri: 'file:///bundled/catalog.sqlite' });
  native.copy.mockImplementation(async (destination: { name: string }) => { native.existingFiles.add(destination.name); });
  // Metro turns this require into an asset identifier. Node otherwise tries to
  // parse SQLite bytes as JS; seed its native CJS cache at this platform boundary.
  const nodeRequire = createRequire(import.meta.url);
  const assetPath = fileURLToPath(new URL('../mobile/assets/catalog.sqlite', import.meta.url));
  const previous = nodeRequire.cache[assetPath];
  const assetModule = new Module(assetPath);
  assetModule.exports = 'catalog-asset';
  assetModule.loaded = true;
  nodeRequire.cache[assetPath] = assetModule;
  const restore = () => {
    if (previous) nodeRequire.cache[assetPath] = previous;
    else delete nodeRequire.cache[assetPath];
  };
  return { ...core, bundledFood: food, restore };
}

it('searches a nonempty installed core and bundled fallback without deadlocking, then reuses the bundle next launch', async () => {
  const fixture = await installBundledFixture();
  try {
    let runtime = await fixture.getRuntime();
    const result = await beforeCatalogReady(runtime.repository.searchFoods('oats'));
    expect(result.foods.map(food => food.id)).toEqual(expect.arrayContaining([fixture.food.id, fixture.bundledFood.id]));
    expect(native.downloadAsset).toHaveBeenCalledTimes(1);
    expect(native.copy).toHaveBeenCalledTimes(1);
    expect(native.inspect).toHaveBeenCalledTimes(1);
    vi.resetModules();
    vi.clearAllMocks();
    runtime = await fixture.getRuntime();
    const next = await beforeCatalogReady(runtime.repository.searchFoods('oats'));
    expect(next.foods.map(food => food.id)).toContain(fixture.bundledFood.id);
    expect(native.downloadAsset).not.toHaveBeenCalled();
    expect(native.copy).not.toHaveBeenCalled();
    expect(native.inspect).not.toHaveBeenCalled();
  } finally { fixture.restore(); }
});

it('resolves a barcode absent from the installed core through the bundled fallback without deadlocking', async () => {
  const fixture = await installBundledFixture();
  try {
    const runtime = await fixture.getRuntime();
    expect(await beforeCatalogReady(runtime.repository.lookupBarcode('012345678905'))).toMatchObject({ food: { id: fixture.bundledFood.id } });
  } finally { fixture.restore(); }
});

it('opens the diary first on a fresh install and prepares bundled foods only on the first search', async () => {
  const fixture = await installBundledFixture();
  try {
    await personal.db.runAsync("DELETE FROM app_meta WHERE key='catalogFile'");
    const runtime = await fixture.getRuntime();
    expect(native.downloadAsset).not.toHaveBeenCalled();
    expect(native.inspect).not.toHaveBeenCalled();
    expect(await beforeCatalogReady(runtime.api('/api/day?date=2026-09-29'))).toMatchObject({ entries: [] });
    const result = await beforeCatalogReady(runtime.repository.searchFoods('oats'));
    expect(result.foods.map(food => food.id)).toEqual([fixture.bundledFood.id]);
    expect(native.downloadAsset).toHaveBeenCalledTimes(1);
    expect(native.copy).toHaveBeenCalledTimes(1);
    expect(native.inspect).toHaveBeenCalledTimes(1);
  } finally { fixture.restore(); }
});

it('preserves offline updater backoff on a fresh install without repeating requests', async () => {
  const offline = vi.fn().mockRejectedValue(new Error('Offline'));
  vi.stubGlobal('fetch', offline);
  const { getLocalRuntime } = await import('../mobile/src/local/native');
  const runtime = await beforeCatalogReady(getLocalRuntime());
  await beforeCatalogReady(runtime.updater.check());
  expect(offline).toHaveBeenCalledTimes(2); // Independent core and pack feeds.
  const metadata = await personal.db.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key='catalogUpdate'");
  const failed = JSON.parse(metadata!.value);
  expect(failed).toMatchObject({ failures: 1 });
  expect(failed.nextCheck).toBeGreaterThan(Date.now());
  expect(failed.version).toBeUndefined();
  await beforeCatalogReady(runtime.updater.check());
  expect(offline).toHaveBeenCalledTimes(2);
  expect(await personal.db.getFirstAsync("SELECT value FROM app_meta WHERE key='catalogUpdate'")).toEqual(metadata);
  expect(native.inspect).not.toHaveBeenCalled();
  expect(native.digest).not.toHaveBeenCalled();
});

it('clears the updater catalog version when the file fingerprint changes without expensive catalog work', async () => {
  const fixture = await installedCore(true);
  native.existingFiles.add(`${fixture.name}.verified.json`);
  native.receipts.set(`${fixture.name}.verified.json`, JSON.stringify({ validation: 1, identity: fixture.name, bytes: 4096, modified: 100, version: 'test-v1' }));
  await fixture.logFood(await fixture.getRuntime());
  await personal.db.runAsync('INSERT INTO app_meta VALUES(?,?)', 'catalogUpdate', JSON.stringify({
    version: 'test-v1', failures: 2, nextCheck: Date.now() + 3600000,
  }));
  vi.resetModules();
  vi.clearAllMocks();
  native.modified++;
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
  const runtime = await fixture.getRuntime();
  await beforeCatalogReady(runtime.updater.check(true));
  const metadata = await personal.db.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key='catalogUpdate'");
  expect(JSON.parse(metadata!.value)).toMatchObject({ failures: 3 });
  expect(JSON.parse(metadata!.value).version).toBeUndefined();
  expect(native.openDatabase.mock.calls.map(([name]) => name)).toEqual([
    'gramello-personal.sqlite', 'gramello-food-cache.sqlite',
  ]);
  expect(native.inspect).not.toHaveBeenCalled();
  expect(native.digest).not.toHaveBeenCalled();
  expect(native.bytes).not.toHaveBeenCalled();
});

it('keeps the current bundled catalog and receipt while removing previous bundle generations', async () => {
  const fixture = await installBundledFixture();
  try {
    const { File } = await vi.importMock<{ File: new (base: string, name: string) => { name: string } }>('../mobile/node_modules/expo-file-system');
    const names = ['starter-dead.sqlite', 'starter-dead.sqlite.verified.json', 'starter-cafe.sqlite', 'starter-cafe.sqlite.verified.json'];
    for (const name of names) native.existingFiles.add(name);
    native.directoryEntries = names.map(name => new File('file:///cache/gramello-catalogs', name));
    await beforeCatalogReady((await fixture.getRuntime()).repository.searchFoods('oats'));
    expect(native.existingFiles.has('starter-cafe.sqlite')).toBe(true);
    expect(native.existingFiles.has('starter-cafe.sqlite.verified.json')).toBe(true);
    expect(native.existingFiles.has('starter-dead.sqlite')).toBe(false);
    expect(native.existingFiles.has('starter-dead.sqlite.verified.json')).toBe(false);
    expect(native.existingFiles.has(fixture.name)).toBe(true);
  } finally { fixture.restore(); }
});
