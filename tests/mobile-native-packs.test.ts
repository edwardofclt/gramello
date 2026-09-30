import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ files: new Map<string, { bytes: Uint8Array; time: number }>(), failWrites: false, hash: vi.fn(), inspect: vi.fn(), open: vi.fn() }));
vi.mock('../mobile/node_modules/expo-file-system', () => {
  class File {
    name: string; constructor(_directory: unknown, name: string) { this.name = name; }
    get exists() { return mocks.files.has(this.name); }
    get size() { return mocks.files.get(this.name)?.bytes.length ?? 0; }
    info() { return { modificationTime: mocks.files.get(this.name)?.time, size: this.size }; }
    async bytes() { return mocks.files.get(this.name)!.bytes; }
    async text() { return new TextDecoder().decode(await this.bytes()); }
    write(value: string) { if (mocks.failWrites) throw new Error('Disk full'); mocks.files.set(this.name, { bytes: new TextEncoder().encode(value), time: 1 }); }
    delete() { mocks.files.delete(this.name); }
    static async downloadFileAsync() { throw new Error('Unexpected download'); }
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
  mocks.hash.mockResolvedValue(new Uint8Array(32).fill(0xab).buffer);
  mocks.inspect.mockResolvedValue(undefined);
  mocks.open.mockImplementation(async () => ({ execAsync: vi.fn(), closeAsync: vi.fn() }));
});
test('legacy packs verify lazily once and reuse receipts across restarts', async () => {
  const storage = await create(); expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
  await storage.withReader(pack, async () => undefined);
  await storage.withReader(pack, async () => undefined);
  expect(await storage.available!(pack)).toBe(true);
  const restarted = await create(); await restarted.withReader(pack, async () => undefined);
  expect(mocks.hash).toHaveBeenCalledTimes(1); expect(mocks.inspect).toHaveBeenCalledTimes(1);
});
test('changed file identities trigger full validation; corruption is rejected', async () => {
  const storage = await create(); await storage.install(pack);
  mocks.files.get(filename)!.time = 2;
  await storage.withReader(pack, async () => undefined);
  expect(mocks.hash).toHaveBeenCalledTimes(2); expect(mocks.inspect).toHaveBeenCalledTimes(2);
  mocks.files.get(filename)!.time = 3; mocks.hash.mockResolvedValue(new Uint8Array(32).buffer);
  expect(await storage.available!(pack)).toBe(false);
  await expect(storage.withReader(pack, async () => undefined)).rejects.toThrow();
});
test('retirement waits for active readers before deleting their files', async () => {
  const storage = await create(); await storage.install(pack);
  let release!: () => void; let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const read = storage.withReader(pack, async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); expect(mocks.files.has(filename)).toBe(true); });
  await ready; const retiring = storage.retire([]); await Promise.resolve(); expect(mocks.files.has(filename)).toBe(true);
  release(); await Promise.all([read, retiring]); expect(mocks.files.has(filename)).toBe(false);
});
test('missing files and malformed or obsolete receipts cannot bypass verification', async () => {
  const storage = await create(); await storage.install(pack);
  const receipt = mocks.files.get(`pack-${pack.sha256}.verified.json`)!;
  const saved = JSON.parse(new TextDecoder().decode(receipt.bytes)); saved.revision = 0;
  receipt.bytes = new TextEncoder().encode(JSON.stringify(saved));
  await (await create()).withReader(pack, async () => undefined); expect(mocks.inspect).toHaveBeenCalledTimes(2);
  mocks.files.get(`pack-${pack.sha256}.verified.json`)!.bytes = new TextEncoder().encode('{broken');
  await (await create()).withReader(pack, async () => undefined); expect(mocks.inspect).toHaveBeenCalledTimes(3);
  mocks.files.delete(filename); expect(await storage.available!(pack)).toBe(false);
  await expect(storage.withReader(pack, async () => undefined)).rejects.toThrow();
});
test('installation always performs complete validation and rejects invalid records', async () => {
  const storage = await create(); await storage.install(pack); await storage.install(pack);
  expect(mocks.hash).toHaveBeenCalledTimes(2); expect(mocks.inspect).toHaveBeenCalledTimes(2);
  mocks.files.get(filename)!.time = 3; mocks.inspect.mockRejectedValueOnce(new Error('Invalid food record'));
  await expect(storage.withReader(pack, async () => undefined)).rejects.toThrow('Invalid food record');
});
test('concurrent legacy readers share one verification and do not touch personal metadata', async () => {
  const readMetadata = vi.fn(async <T>(key: string) => (key === 'foodPackIndex' ? { active: [pack], previous: [] } : null) as T | null);
  const saveMetadata = vi.fn(); const storage = await createNativePackStorage(async <T>(key: string) => await readMetadata(key) as T | null, saveMetadata, 'https://example.com/manifest');
  await Promise.all(Array.from({ length: 5 }, () => storage.withReader(pack, async () => undefined)));
  expect(mocks.hash).toHaveBeenCalledTimes(1); expect(mocks.inspect).toHaveBeenCalledTimes(1);
  expect(readMetadata).toHaveBeenCalledTimes(1); expect(saveMetadata).not.toHaveBeenCalled();
});

test('automatic availability checks leave legacy pack validation lazy', async () => {
  const storage = await create();
  expect(await storage.available!(pack)).toBe(true);
  expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled();
  await storage.withReader(pack, async () => undefined);
  expect(mocks.hash).toHaveBeenCalledTimes(1); expect(mocks.inspect).toHaveBeenCalledTimes(1);
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

test('a truncated retained file is removed so installation can retry its download', async () => {
  const storage = await create(); await storage.install(pack);
  mocks.files.set(filename, { bytes: new Uint8Array(8), time: 2 });
  await expect(storage.install(pack)).rejects.toThrow('unavailable or corrupt');
  expect(mocks.files.has(filename)).toBe(false);
  expect(mocks.files.has(`pack-${pack.sha256}.verified.json`)).toBe(false);
});
