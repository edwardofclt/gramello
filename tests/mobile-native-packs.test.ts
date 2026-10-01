import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ files: new Map<string, { bytes: Uint8Array; time: number }>(), failWrites: false, download: vi.fn(), hash: vi.fn(), inspect: vi.fn(), open: vi.fn() }));
vi.mock('../mobile/node_modules/expo/fetch', () => ({ fetch: mocks.download }));
vi.mock('../mobile/src/catalog/native-pack-routes', () => ({ createNativePackRoutes: () => ({ retire: async () => {} }) }));
// These tests isolate transport/activation. Real index persistence and queries
// are exercised with SQLite in native-packs.test.ts and pack-search-index.test.ts.
vi.mock('../mobile/src/catalog/native-pack-search', () => ({ createNativePackSearch: () => ({
  index: async () => {}, missing: async () => [], retire: async () => {}, reset: async () => {},
}) }));
vi.mock('../mobile/node_modules/expo-file-system', () => {
  class File {
    name: string; constructor(_directory: unknown, name: string) { this.name = name; }
    get exists() { return mocks.files.has(this.name); }
    get size() { return mocks.files.get(this.name)?.bytes.length ?? 0; }
    get uri() { return `packs/${this.name}`; }
    create() { mocks.files.set(this.name, { bytes: new Uint8Array(), time: 1 }); }
    open() { return { writeBytes: (bytes: Uint8Array) => {
      const old = mocks.files.get(this.name)!;
      const next = new Uint8Array(old.bytes.length + bytes.length); next.set(old.bytes); next.set(bytes, old.bytes.length);
      mocks.files.set(this.name, { bytes: next, time: old.time });
    }, close() {} }; }
    move(destination: { name: string }) { mocks.files.set(destination.name, mocks.files.get(this.name)!); mocks.files.delete(this.name); this.name = destination.name; }
    info() { return { modificationTime: mocks.files.get(this.name)?.time, size: this.size }; }
    async bytes() { return mocks.files.get(this.name)!.bytes; }
    async text() { return new TextDecoder().decode(await this.bytes()); }
    write(value: string) { if (mocks.failWrites) throw new Error('Disk full'); mocks.files.set(this.name, { bytes: new TextEncoder().encode(value), time: 1 }); }
    delete() { mocks.files.delete(this.name); }
    static downloadFileAsync = mocks.download;
  }
  class Directory { uri = 'packs'; create() {} list() { return [...mocks.files.keys()].map(name => new File(this, name)); } }
  return { File, Directory, Paths: { document: 'documents', availableDiskSpace: 1e10 } };
});
vi.mock('../mobile/node_modules/expo-crypto', () => ({ digest: mocks.hash, CryptoDigestAlgorithm: { SHA256: 'SHA256' } }));
vi.mock('../mobile/node_modules/expo-sqlite', () => ({ openDatabaseAsync: mocks.open }));
vi.mock('../mobile/src/catalog/packs', async importOriginal => ({ ...await importOriginal<object>(), inspectFoodPack: mocks.inspect }));
import { createNativePackStorage } from '../mobile/src/catalog/native-packs';
import type { FoodPack } from '../mobile/src/catalog/packs';
const pack: FoodPack = { schemaVersion: 1, id: 'off-1-0', version: 'v1', source: 'off', market: 'US', license: 'ODbL-1.0', url: 'https://example.com/pack.sqlite', sha256: 'ab'.repeat(32), bytes: 4096, count: 1, bucket: 0, buckets: 1 };
const filename = `pack-${pack.sha256}.sqlite`;
const create = () => createNativePackStorage(async <T>(key: string) => (key === 'foodPackIndex' ? { active: [pack], previous: [] } : null) as T | null, vi.fn(), 'https://example.com/manifest');
beforeEach(() => {
  vi.clearAllMocks(); mocks.failWrites = false; mocks.files.clear(); mocks.files.set(filename, { bytes: new Uint8Array(pack.bytes), time: 1 });
  mocks.download.mockRejectedValue(new Error('Unexpected download'));
  mocks.hash.mockResolvedValue(new Uint8Array(32).fill(0xab).buffer);
  mocks.inspect.mockResolvedValue(undefined);
  mocks.open.mockImplementation(async () => ({ execAsync: vi.fn(), closeAsync: vi.fn() }));
});
test('activated legacy packs are readable across restarts without revalidation', async () => {
  const storage = await create(); expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
  await storage.withReader(pack, async () => undefined);
  await storage.withReader(pack, async () => undefined);
  expect(await storage.available!(pack)).toBe(true);
  const restarted = await create(); await restarted.withReader(pack, async () => undefined);
  expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
});
test('changed file identities fail promptly without revalidating during reads', async () => {
  const storage = await create(); await storage.install(pack);
  mocks.hash.mockClear(); mocks.inspect.mockClear();
  mocks.files.get(filename)!.time = 2;
  expect(await storage.available!(pack)).toBe(false);
  await expect(storage.withReader(pack, async () => undefined)).rejects.toThrow();
  expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
});
test('retirement waits for active readers before deleting their files', async () => {
  const storage = await create(); await storage.install(pack);
  let release!: () => void; let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const read = storage.withReader(pack, async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); expect(mocks.files.has(filename)).toBe(true); });
  await ready; const retiring = storage.retire([]); await Promise.resolve(); expect(mocks.files.has(filename)).toBe(true);
  release(); await Promise.all([read, retiring]); expect(mocks.files.has(filename)).toBe(false);
});
test('legacy receipt formats do not revalidate activated files, and missing files fail', async () => {
  const storage = await create(); await storage.install(pack);
  const receipt = mocks.files.get(`pack-${pack.sha256}.verified.json`)!;
  const saved = JSON.parse(new TextDecoder().decode(receipt.bytes)); saved.revision = 0;
  receipt.bytes = new TextEncoder().encode(JSON.stringify(saved));
  await (await create()).withReader(pack, async () => undefined); expect(mocks.inspect).toHaveBeenCalledTimes(1);
  mocks.files.get(`pack-${pack.sha256}.verified.json`)!.bytes = new TextEncoder().encode('{broken');
  await (await create()).withReader(pack, async () => undefined); expect(mocks.inspect).toHaveBeenCalledTimes(1);
  mocks.files.delete(filename); expect(await storage.available!(pack)).toBe(false);
  await expect(storage.withReader(pack, async () => undefined)).rejects.toThrow();
});
test('installation always performs complete validation and rejects invalid records', async () => {
  const storage = await create(); await storage.install(pack); await storage.install(pack);
  expect(mocks.hash).toHaveBeenCalledTimes(2); expect(mocks.inspect).toHaveBeenCalledTimes(2);
  mocks.files.get(filename)!.time = 3; mocks.inspect.mockRejectedValueOnce(new Error('Invalid food record'));
  await expect(storage.install(pack)).rejects.toThrow('Invalid food record');
});
test('concurrent legacy readers never verify or write personal metadata', async () => {
  const readMetadata = vi.fn(async <T>(key: string) => (key === 'foodPackIndex' ? { active: [pack], previous: [] } : null) as T | null);
  const saveMetadata = vi.fn(); const storage = await createNativePackStorage(async <T>(key: string) => await readMetadata(key) as T | null, saveMetadata, 'https://example.com/manifest');
  await Promise.all(Array.from({ length: 5 }, () => storage.withReader(pack, async () => undefined)));
  expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
  expect(readMetadata).toHaveBeenCalledTimes(1); expect(saveMetadata).not.toHaveBeenCalled();
});

test('availability and first reads do no full validation of activated legacy packs', async () => {
  const storage = await create();
  expect(await storage.available!(pack)).toBe(true);
  expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled();
  await storage.withReader(pack, async () => undefined);
  expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
});
test('receipt write failures keep verified foods usable without repeated hashing', async () => {
  mocks.failWrites = true; const storage = await create();
  await storage.install(pack); await storage.withReader(pack, async () => undefined);
  expect(await storage.available!(pack)).toBe(true);
  expect(mocks.hash).toHaveBeenCalledTimes(1); expect(mocks.inspect).toHaveBeenCalledTimes(1);
});

test('a conflicting descriptor cannot delete the previously verified active pack', async () => {
  const storage = await create(); await storage.install(pack);
  mocks.inspect.mockRejectedValueOnce(new Error('Catalog integrity or schema verification failed.'));
  await expect(storage.install({ ...pack, version: 'conflicting-version' })).rejects.toThrow('verification failed');
  expect(mocks.files.has(filename)).toBe(true);
  await storage.withReader(pack, async () => undefined);
  expect(await storage.list()).toEqual([pack]);
});

test('a conflicting size descriptor cannot delete a valid retained pack', async () => {
  const storage = await create(); await storage.install(pack);
  await expect(storage.install({ ...pack, bytes: pack.bytes * 2 })).rejects.toThrow();
  expect(mocks.files.has(filename)).toBe(true);
  expect(mocks.files.has(`pack-${pack.sha256}.verified.json`)).toBe(true);
  await storage.withReader(pack, async () => undefined);
});

test('a truncated retained file is removed before retrying its download', async () => {
  const storage = await create(); await storage.install(pack);
  mocks.files.set(filename, { bytes: new Uint8Array(8), time: 2 });
  await expect(storage.install(pack)).rejects.toThrow('Unexpected download');
  expect(mocks.files.has(filename)).toBe(false);
  expect(mocks.files.has(`pack-${pack.sha256}.verified.json`)).toBe(false);
});


test('parallel installs report progress, preserve both descriptors, and finish before retirement', async () => {
  const packs = [
    { ...pack, id: 'off-2-0', bucket: 0, buckets: 2 },
    { ...pack, id: 'off-2-1', bucket: 1, buckets: 2, sha256: 'cd'.repeat(32) },
  ];
  mocks.files.clear();
  const finishDownloads: (() => void)[] = [], finishInspection: (() => void)[] = [];
  mocks.download.mockImplementation(async () => {
    const byte = finishDownloads.length ? 0xcd : 0xab;
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(2048).fill(byte));
      finishDownloads.push(() => { controller.enqueue(new Uint8Array(2048).fill(byte)); controller.close(); });
    } }));
  });
  mocks.hash.mockImplementation(async (_algorithm, bytes: Uint8Array) => new Uint8Array(32).fill(bytes[0]).buffer);
  mocks.inspect.mockImplementation(() => new Promise<void>(resolve => finishInspection.push(resolve)));
  const save = vi.fn();
  const storage = await createNativePackStorage(async () => null, save, 'https://example.com/manifest');
  const progress = packs.map(() => vi.fn());
  const installs = packs.map((value, index) => storage.install(value, progress[index]));
  await vi.waitFor(() => expect(finishDownloads).toHaveLength(2));
  progress.forEach(callback => expect(callback).toHaveBeenCalledWith(2048));
  finishDownloads.forEach(finish => finish());
  await vi.waitFor(() => expect(finishInspection).toHaveLength(2));
  const retiring = storage.retire(packs);
  finishInspection.forEach(finish => finish());
  await Promise.all([...installs, retiring]);
  expect(await storage.list()).toEqual(expect.arrayContaining(packs));
  expect(save.mock.calls.at(-1)?.[1].active).toHaveLength(2);
  for (const value of packs) expect(mocks.files.has(`pack-${value.sha256}.sqlite`)).toBe(true);
});

test('reinstalling a retired descriptor waits for readers of its preexisting file', async () => {
  const storage = await create(); await storage.install(pack);
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const reading = storage.withReader(pack, async () => {
    entered(); await new Promise<void>(resolve => { release = resolve; });
    expect(mocks.files.has(filename)).toBe(true);
  });
  await ready;
  const retiring = storage.retire([]);
  await vi.waitFor(async () => expect(await storage.list()).toEqual([]));
  mocks.hash.mockResolvedValue(new Uint8Array(32).buffer);
  const installing = storage.install(pack);
  const rejected = expect(installing).rejects.toThrow('Unexpected download');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(mocks.files.has(filename)).toBe(true);
  expect(mocks.hash).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([reading, retiring, rejected]);
});
