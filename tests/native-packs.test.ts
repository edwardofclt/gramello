import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { buildCatalog } from '../scripts/food-catalog.mjs';
import { normalizeOffProduct } from '../lib/catalog-import';
import off from './fixtures/al-fresco-off.json';
import usda from './fixtures/al-fresco-usda.json';
import { normalizeUsdaBranded } from '../lib/catalog-import';
import { createPackCatalog } from '../mobile/src/catalog/pack-reader';
import { platform } from './helpers/native-pack-platform';
import type { FoodPack } from '../mobile/src/catalog/packs';
vi.mock('../mobile/node_modules/expo-file-system/src/index.ts', async () => (await import('./helpers/native-pack-platform')).fileSystem);
vi.mock('../mobile/node_modules/expo-crypto/build/Crypto.js', async () => (await import('./helpers/native-pack-platform')).cryptoAdapter);
vi.mock('../mobile/node_modules/expo-sqlite/build/index.js', async () => (await import('./helpers/native-pack-platform')).sqliteAdapter);
vi.mock('../mobile/node_modules/expo/fetch.js', async () => ({ fetch: (input: Parameters<typeof fetch>[0], init?: RequestInit) => platform.fetcher(input, init) }));
import { createNativePackStorage } from '../mobile/src/catalog/native-packs';
let pack: FoodPack, bytes: Uint8Array, root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gramello-native-packs-')); platform.root = root;
  platform.reads = 0; platform.writes = []; platform.missingStamp = false; platform.opened = 0; platform.closed = 0;
  const fixture = join(root, 'fixture.sqlite');
  buildCatalog([normalizeOffProduct(off)!], fixture, 'off-v1', 'off'); bytes = new Uint8Array(readFileSync(fixture));
  pack = { schemaVersion: 1, id: 'off-1-0', source: 'off', license: 'ODbL-1.0', market: 'US', bucket: 0, buckets: 1, version: 'off-v1', count: 1, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), url: 'https://example.org/off.sqlite' };
  platform.fetcher = async () => new Response(bytes as Uint8Array<ArrayBuffer>);
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
async function setup() {
  const values = new Map<string, unknown>(); let reject = false;
  const metadata = async <T>(key: string) => (values.get(key) ?? null) as T | null;
  const save = async (key: string, value: unknown) => { if (reject) throw new Error('quota'); values.set(key, value); };
  const storage = await createNativePackStorage(metadata, save, 'https://example.org/manifest');
  return { storage, values, reject: () => { reject = true; }, reopen: () => createNativePackStorage(metadata, save, 'https://example.org/manifest') };
}
const installedFile = () => join(root, 'gramello-food-packs', `pack-${pack.sha256}.sqlite`);
describe('native expansion files', () => {
  it('persists a shared search index during installation and reads only matching packs after restart', async () => {
    const fake = await setup(); await fake.storage.install(pack);
    const reopened = await fake.reopen(); platform.reads = 0;
    const result = await reopened.search('al fresco apple maple sausage');
    expect(result.foods.map(food => food.id)).toContain('off-0030771094625');
    expect(platform.reads).toBe(0);
    const before = platform.opened;
    expect((await reopened.search('nonexistent product')).foods).toEqual([]);
    // The shared index opens, but no canonical expansion file opens on a miss.
    expect(platform.opened - before).toBe(1);
  });
  it('prepares legacy installed chunks outside search without hashing or downloading again', async () => {
    const fake = await setup(); await fake.storage.install(pack);
    rmSync(join(root, 'gramello-food-packs', 'food-search.sqlite'));
    const legacy = await fake.reopen(); platform.reads = 0;
    expect((await legacy.search('sausage')).issues?.length).toBeGreaterThan(0);
    const download = vi.spyOn(platform, 'fetcher');
    await legacy.prepareSearch();
    expect((await legacy.search('al fresco apple maple sausage')).foods).toHaveLength(1);
    expect(platform.reads).toBe(0); expect(download).not.toHaveBeenCalled(); download.mockRestore();
  });
  it('rebuilds a damaged derived index during preparation without removing or hashing installed packs', async () => {
    const fake = await setup(); await fake.storage.install(pack);
    writeFileSync(join(root, 'gramello-food-packs', 'food-search.sqlite'), new Uint8Array(4096).fill(255));
    const reopened = await fake.reopen(); platform.reads = 0;
    await reopened.prepareSearch();
    expect((await reopened.search('al fresco apple maple sausage')).foods).toHaveLength(1);
    expect(platform.reads).toBe(0);
    expect(await reopened.list()).toEqual([pack]);
  });
  it('rebuilds failed FTS storage even when its pack markers still report ready', async () => {
    const fake = await setup(); await fake.storage.install(pack);
    const index = new DatabaseSync(join(root, 'gramello-food-packs', 'food-search.sqlite'));
    index.exec('DROP TABLE pack_search_terms');
    expect(index.prepare('SELECT count(*) AS count FROM search_packs').get()).toMatchObject({ count: 1 });
    index.close();
    const reopened = await fake.reopen(); platform.reads = 0;
    await expect(reopened.search('al fresco apple maple sausage')).rejects.toThrow();
    await reopened.prepareSearch();
    expect((await reopened.search('al fresco apple maple sausage')).foods).toHaveLength(1);
    expect(platform.reads).toBe(0);
    expect(await reopened.list()).toEqual([pack]);
  });
  it('recovers abandoned partials after recreation without removing active transfers', async () => {
    const fake = await setup();
    const orphan = join(root, 'gramello-food-packs', `pack-${pack.sha256}-1234-dead.partial`);
    const unrelated = join(root, 'gramello-food-packs', 'keep.partial');
    writeFileSync(orphan, new Uint8Array(100)); writeFileSync(unrelated, new Uint8Array(100));
    const { readdirSync } = await import('node:fs');
    let controller!: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>;
    platform.fetcher = async () => new Response(new ReadableStream({ start(c) { controller = c; c.enqueue(bytes.slice(0, 4096) as Uint8Array<ArrayBuffer>); } }));
    const pending = fake.storage.install(pack);
    await vi.waitFor(() => expect(platform.writes).toEqual([4096]));
    const active = readdirSync(join(root, 'gramello-food-packs')).find(name => name !== orphan.split('/').at(-1) && /^pack-.*\.partial$/.test(name))!;
    const recreated = await fake.reopen(); await recreated.recover?.();
    expect(readdirSync(join(root, 'gramello-food-packs')).sort()).toEqual([active, 'keep.partial'].sort());
    controller.enqueue(bytes.slice(4096) as Uint8Array<ArrayBuffer>); controller.close(); await pending;
    expect(await fake.storage.list()).toEqual([pack]);
  });
  it('can isolate fixture transport without changing signed descriptors', async () => {
    const fixtureFetch = vi.fn(async () => new Response(bytes as Uint8Array<ArrayBuffer>));
    const storage = await createNativePackStorage(async () => null, async () => {}, 'https://example.org/manifest', { fetcher: fixtureFetch as unknown as NonNullable<Parameters<typeof createNativePackStorage>[3]>['fetcher'] });
    await storage.install(pack);
    expect(fixtureFetch).toHaveBeenCalledWith(pack.url, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(await storage.list()).toEqual([pack]);
  });
  it('persists USDA routes across restart and indexes legacy packs once', async () => {
    const fixture = join(root, 'usda.sqlite'); buildCatalog([normalizeUsdaBranded(usda)!], fixture, 'usda-v1', 'usda-branded');
    bytes = new Uint8Array(readFileSync(fixture));
    pack = { ...pack, id: 'usda-branded-1-0', source: 'usda-branded', license: 'CC0-1.0', version: 'usda-v1', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const fake = await setup(); await fake.storage.install(pack);
    const reopened = await fake.reopen();
    expect(typeof reopened.routes).toBe('function');
    let opened = 0;
    const catalog = createPackCatalog(reopened.list, (pack, work) => { opened++; return reopened.withReader(pack, work); },
      { getFood: async () => null, search: async () => [], barcode: async () => null }, reopened.routes);
    expect((await catalog.getFood('usda-1892562'))?.id).toBe('usda-1892562'); expect(opened).toBe(1);
    opened = 0; expect(await catalog.getFood('usda-999')).toBeNull(); expect(opened).toBe(0);
    const routeFile = join(root, 'gramello-food-packs', 'usda-routes.sqlite'); rmSync(routeFile);
    const legacy = await fake.reopen();
    expect(await legacy.routes('usda-1892562', await legacy.list())).toMatchObject({ packs: [pack], complete: true });
  });
  it('repairs corruption in the same install attempt', async () => {
    const { storage } = await setup(); await storage.install(pack);
    writeFileSync(installedFile(), new Uint8Array(bytes.length).fill(1));
    await storage.install(pack);
    expect(await storage.withReader(pack, r => r.getFood('off-0030771094625'))).toMatchObject({ name: expect.stringContaining('Chicken') });
    expect(platform.opened).toBe(platform.closed);
  });
  it('rejects overflow before writing the offending chunk and cancels', async () => {
    let cancelled = false;
    platform.fetcher = async () => new Response(new ReadableStream({ start(c) { c.enqueue(bytes); c.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } }));
    const { storage } = await setup(); await expect(storage.install(pack)).rejects.toThrow(/exceed|verification/);
    expect(cancelled).toBe(true); expect(platform.writes).toEqual([pack.bytes]); expect(await storage.list()).toEqual([]);
  });
  it('verifies once across warm opens but rejects changed same-size content', async () => {
    const { storage } = await setup(); await storage.install(pack); const cold = await setupReopened(storage);
    platform.reads = 0;
    await cold.withReader(pack, r => r.getFood('off-0030771094625'));
    await cold.withReader(pack, r => r.getFood('off-0030771094625'));
    expect(platform.reads).toBe(0);
    writeFileSync(installedFile(), new Uint8Array(bytes.length).fill(1)); utimesSync(installedFile(), new Date(), new Date(Date.now() + 1000));
    await expect(cold.withReader(pack, r => r.getFood('x'))).rejects.toThrow(/corrupt|verification/);
  });
  it('reads activated files without hashing when modification metadata is unavailable', async () => {
    const { storage } = await setup(); await storage.install(pack); platform.reads = 0; platform.missingStamp = true;
    await storage.withReader(pack, r => r.getFood('x')); await storage.withReader(pack, r => r.getFood('x'));
    expect(platform.reads).toBe(0);
    platform.missingStamp = false; platform.reads = 0;
    await storage.available!(pack); await storage.available!(pack); expect(platform.reads).toBe(0);
  });
  it('reads a legacy activated pack after restart without a receipt or full-file validation', async () => {
    const fake = await setup(); await fake.storage.install(pack);
    rmSync(installedFile().replace(/\.sqlite$/, '.verified.json'));
    const reopened = await fake.reopen(); platform.reads = 0;
    const result = await reopened.withReader(pack, reader => reader.search('al fresco apple maple sausage'));
    expect(result.map(food => food.id)).toContain('off-0030771094625');
    expect(platform.reads).toBe(0);
  });
  it('retains old activation on metadata failure', async () => {
    const fake = await setup(); await fake.storage.install(pack); fake.reject();
    await expect(fake.storage.install(pack)).rejects.toThrow('quota');
    expect(await fake.storage.list()).toEqual([pack]);
  });
  it('bounds the native manifest before EOF', async () => {
    let cancelled = false;
    platform.fetcher = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('é'.repeat(260001))); }, cancel() { cancelled = true; } }));
    await expect((await setup()).storage.fetchManifest()).rejects.toThrow('exceeds'); expect(cancelled).toBe(true);
  });
});
async function setupReopened(storage: Awaited<ReturnType<typeof createNativePackStorage>>) {
  const values = new Map([['foodPackIndex', { active: await storage.list(), previous: [] }]]);
  return createNativePackStorage(async <T>(key: string) => (values.get(key) ?? null) as T | null, async () => {}, 'https://example.org/manifest');
}
