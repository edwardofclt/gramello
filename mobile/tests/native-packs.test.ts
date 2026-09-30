import { expect, it, vi } from 'vitest';
import type { FoodPack } from '../src/catalog/packs';

const inspection = vi.hoisted(() => ({ started: 0, gate: undefined as Promise<void> | undefined }));
const files = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock('expo/fetch', () => ({ fetch: globalThis.fetch }));
vi.mock('../src/catalog/native-pack-routes', () => ({
  createNativePackRoutes: () => ({
    indexed: async () => true, index: async () => {}, retire: async () => {},
    lookup: async () => ({ packs: [], complete: true }),
  }),
}));
vi.mock('expo-file-system', () => ({
  Paths: { document: '/documents', availableDiskSpace: 1024 ** 3 },
  Directory: class { uri = '/packs'; create() {} list() { return []; } },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) { this.name = name; }
    get exists() { return files.has(this.name); }
    get size() { return files.get(this.name)?.length; }
    async bytes() { return files.get(this.name)!; }
    delete() { files.delete(this.name); }
  },
}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  digest: async (_algorithm: string, bytes: Uint8Array) => crypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
}));
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {}, closeAsync: async () => {},
    getAllAsync: async () => { inspection.started++; await inspection.gate; return [{ id: 'usda-1', food: JSON.stringify({ id: 'usda-1', name: 'Food',
      source: 'USDA', servingGrams: 100, servingLabel: '100 g', calories: 100, protein: 1, carbs: 1, fat: 1 }) }]; },
    getFirstAsync: async (sql: string) => {
      if (sql.includes('quick_check')) return { quick_check: 'ok' };
      if (sql.includes('user_version')) return { user_version: 1 };
      if (sql.includes("key='version'")) return { value: 'v1' };
      if (sql.includes("key='pack_source'")) return { value: 'usda-branded' };
      if (sql.includes("key='market'")) return { value: 'US' };
      if (sql.includes("key='license'")) return { value: 'CC0-1.0' };
      if (sql.includes('COUNT(*)')) return { count: 1 };
      return null;
    },
  }),
}));
import { createNativePackStorage } from '../src/catalog/native-packs';

it('preserves both native pack descriptors when metadata saves overlap', async () => {
  files.clear();
  const packs: FoodPack[] = await Promise.all([0, 1].map(async bucket => {
    const bytes = new Uint8Array(4096).fill(bucket);
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    files.set(`pack-${sha256}.sqlite`, bytes);
    return { schemaVersion: 1, id: `usda-branded-2-${bucket}`, source: 'usda-branded', license: 'CC0-1.0',
      market: 'US', bucket, buckets: 2, version: 'v1', count: 1, bytes: 4096, sha256, url: 'https://example.org/pack.sqlite' };
  }));
  let saved: unknown, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let saves = 0;
  const storage = await createNativePackStorage(async () => null, async (_key, value) => {
    saves++;
    if (saves === 1) await gate;
    saved = value;
  }, 'https://example.org/manifest');
  const installs = packs.map(pack => storage.install(pack));
  try {
    await vi.waitFor(() => expect(saves).toBeGreaterThan(0));
    // Give a competing install time to reach metadata persistence.
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally { release(); }
  await Promise.all(installs);
  expect(saved).toMatchObject({ active: expect.arrayContaining(packs) });
  expect(await storage.list()).toHaveLength(2);
});

it('verifies independent candidate databases concurrently so workers can refill download slots', async () => {
  const bytes = new Uint8Array(4096);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  files.set(`pack-${sha256}.sqlite`, bytes);
  const packs: FoodPack[] = [0, 1].map(bucket => ({
    schemaVersion: 1, id: `usda-branded-2-${bucket}`, source: 'usda-branded', license: 'CC0-1.0',
    market: 'US', bucket, buckets: 2, version: 'v1', count: 1, bytes: 4096, sha256, url: 'https://example.org/pack.sqlite',
  }));
  let release!: () => void;
  inspection.started = 0;
  inspection.gate = new Promise<void>(resolve => { release = resolve; });
  const storage = await createNativePackStorage(async () => null, async () => {}, 'https://example.org/manifest');
  const installs = packs.map(pack => storage.install(pack));
  try { await vi.waitFor(() => expect(inspection.started).toBe(2)); }
  finally { release(); await Promise.all(installs); inspection.gate = undefined; }
  expect(await storage.list()).toHaveLength(2);
});
