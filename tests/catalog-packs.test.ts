import { describe, expect, it, vi } from 'vitest';
import nacl from 'tweetnacl';
import { createPackUpdater, verifyPackManifest, PackManifestChangedError, type FoodPack, type PackStorage } from '../mobile/src/catalog/packs';
import { createPackCatalog } from '../mobile/src/catalog/pack-reader';
import { normalizeUsdaBranded, normalizeOffProduct } from '../lib/catalog-import';
import usda from './fixtures/al-fresco-usda.json';
import off from './fixtures/al-fresco-off.json';
import type { FoodCatalog } from '../mobile/src/local/repository';

const keys = nacl.sign.keyPair();
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const publicKey = hex(keys.publicKey);
const pack = (source: 'usda-branded' | 'off'): FoodPack => ({ schemaVersion: 1, id: `${source}-1-0`, source, market: 'US', license: source === 'off' ? 'ODbL-1.0' : 'CC0-1.0', bucket: 0, buckets: 1,
  version: `${source}-v1`, url: `https://example.org/${source}.sqlite`, bytes: 4096, sha256: 'a'.repeat(64), count: 1 });
const a = pack('usda-branded'), b = pack('off');
function envelope(packs = [a, b], overrides = {}) {
  const payload = JSON.stringify({ schemaVersion: 2, version: 'us-v1', publishedAt: '2026-09-29T00:00:00Z', packs, ...overrides });
  return { payload, signature: hex(nacl.sign.detached(new TextEncoder().encode(payload), keys.secretKey)) };
}
function storage() {
  const installed: FoodPack[] = [], attempts: string[] = [];
  let state = {}, fail: string | undefined, retirements = 0;
  const value: PackStorage = {
    load: async () => state, save: async next => { state = next; }, list: async () => [...installed],
    fetchManifest: async () => envelope(),
    install: async next => { attempts.push(next.id); if (fail === next.id) throw new Error('interrupted'); installed.splice(0, installed.length, ...installed.filter(old => old.id !== next.id), next); },
    retire: async wanted => { retirements++; installed.splice(0, installed.length, ...installed.filter(old => wanted.some(next => next.id === old.id && next.sha256 === old.sha256))); },
  };
  return { value, installed, attempts, setFailure: (id?: string) => { fail = id; }, retirements: () => retirements };
}
describe('signed expansion packs', () => {
  it('recovers transfers under the update lease even when a backoff check skips network', async () => {
    const fake = storage(), events: string[] = [];
    fake.value.load = async () => ({ nextCheck: 9000 });
    fake.value.exclusive = async work => { events.push('lease'); try { return await work(); } finally { events.push('release'); } };
    fake.value.recover = async () => { events.push('recover'); };
    await createPackUpdater(fake.value, publicKey, () => 1000).check();
    expect(events).toEqual(['lease', 'recover', 'release']); expect(fake.attempts).toEqual([]);
  });
  it('preserves partial failure and progress during backoff and restart', async () => {
    const fake = storage(); fake.setFailure(a.id);
    const updater = createPackUpdater(fake.value, publicKey, () => 1000, () => 0);
    await updater.check(); await updater.check();
    expect(updater.getStatus()).toMatchObject({ phase: 'error', error: expect.stringContaining('interrupted'), completedPacks: 1, totalPacks: 2 });
    const restarted = createPackUpdater(fake.value, publicKey, () => 2000, () => 0);
    await restarted.check();
    expect(restarted.getStatus()).toMatchObject({ phase: 'error', error: expect.stringContaining('interrupted'), completedPacks: 1, totalPacks: 2 });
  });
  it('refreshes a changed manifest once and retains completed hashes', async () => {
    const fake = storage(); let manifests = 0, attempts = 0;
    const next = { ...b, version: 'off-v2', sha256: 'b'.repeat(64) };
    fake.value.fetchManifest = async () => envelope(++manifests === 1 ? [a, b] : [a, next]);
    const install = fake.value.install;
    fake.value.install = async pack => { if (pack.source === 'off' && ++attempts === 1) throw new PackManifestChangedError(); await install(pack); };
    const updater = createPackUpdater(fake.value, publicKey); await updater.check(true);
    expect(manifests).toBe(2); expect(fake.attempts).toEqual([a.id, next.id]);
    expect(updater.getStatus()).toMatchObject({ phase: 'updated', completedPacks: 2 }); expect(fake.retirements()).toBe(1);
  });
  it('settles live installs before refreshing a changed manifest', async () => {
    const fake = storage(); let manifests = 0, finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    fake.value.fetchManifest = async () => { manifests++; return envelope(); };
    const install = fake.value.install;
    fake.value.install = async pack => {
      if (pack.source === 'off' && manifests === 1) throw new PackManifestChangedError();
      if (pack.source === 'usda-branded') await gate;
      await install(pack);
    };
    const updater = createPackUpdater(fake.value, publicKey), checking = updater.check(true);
    await vi.waitFor(() => expect(updater.getStatus().totalPacks).toBe(2));
    expect(manifests).toBe(1); expect(fake.retirements()).toBe(0);
    finish(); await checking;
    expect(manifests).toBe(2); expect(fake.attempts).toEqual([a.id, b.id]);
    expect(updater.getStatus().phase).toBe('updated');
  });
  it.each(['second transition', 'tampered refresh'])('backs off after %s without retirement', async kind => {
    const fake = storage(); let manifests = 0;
    fake.value.fetchManifest = async () => { manifests++; return kind === 'tampered refresh' && manifests === 2 ? { ...envelope(), signature: '0'.repeat(128) } : envelope(); };
    fake.value.install = async () => { throw new PackManifestChangedError(); };
    const updater = createPackUpdater(fake.value, publicKey); await updater.check(true);
    expect(manifests).toBe(2); expect(updater.getStatus().phase).toBe('error'); expect(fake.retirements()).toBe(0);
  });
  it('shows retry-pending for older failure-only metadata', async () => {
    const fake = storage(); fake.value.load = async () => ({ failures: 2, nextCheck: 9000 });
    const updater = createPackUpdater(fake.value, publicKey, () => 1000); await updater.check();
    expect(updater.getStatus()).toMatchObject({ phase: 'error', error: expect.stringContaining('retry') });
  });
  it('aggregates transfer progress across workers before any pack finishes', async () => {
    const fake = storage();
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    let started = 0;
    fake.value.install = async (_pack, onProgress?: (bytes: number) => void) => {
      onProgress?.(1024);
      // Providers can repeat or regress callbacks; reported progress stays monotonic.
      onProgress?.(512);
      started++;
      await gate;
    };
    const updater = createPackUpdater(fake.value, publicKey);
    const checking = updater.check(true);
    await vi.waitFor(() => expect(started).toBe(2));
    expect(updater.getStatus()).toMatchObject({ phase: 'downloading', completedPacks: 0, downloadedBytes: 2048, totalBytes: 8192 });
    finish(); await checking;
    expect(updater.getStatus()).toMatchObject({ phase: 'updated', completedPacks: 2, downloadedBytes: 8192 });
  });
  it('bounds concurrent downloads, prioritizes USDA and reports out-of-order completions', async () => {
    const fake = storage();
    const packs = Array.from({ length: 5 }, (_, bucket) => ({
      ...a, id: `usda-branded-5-${bucket}`, buckets: 5, bucket,
    }));
    fake.value.fetchManifest = async () => envelope([b, ...packs.slice().reverse()]);
    const gates = new Map<string, () => void>();
    let active = 0, peak = 0;
    fake.value.install = async next => {
      fake.attempts.push(next.id); active++; peak = Math.max(peak, active);
      await new Promise<void>(resolve => { gates.set(next.id, resolve); });
      active--; fake.installed.push(next);
    };
    const updater = createPackUpdater(fake.value, publicKey);
    const checking = updater.check(true);
    await vi.waitFor(() => expect(fake.attempts).toHaveLength(3));
    expect(fake.attempts).toEqual(['usda-branded-5-0', 'usda-branded-5-1', 'usda-branded-5-2']);
    expect(fake.retirements()).toBe(0);
    gates.get('usda-branded-5-1')!();
    await vi.waitFor(() => expect(fake.attempts).toHaveLength(4));
    expect(updater.getStatus()).toMatchObject({ phase: 'downloading', completedPacks: 1, downloadedBytes: 4096 });
    gates.get('usda-branded-5-2')!();
    await vi.waitFor(() => expect(fake.attempts).toHaveLength(5));
    gates.get('usda-branded-5-3')!();
    await vi.waitFor(() => expect(fake.attempts).toHaveLength(6));
    gates.get('usda-branded-5-0')!();
    gates.get('usda-branded-5-4')!();
    gates.get(b.id)!();
    await checking;
    expect(peak).toBe(3);
    expect(fake.retirements()).toBe(1);
    expect(updater.getStatus()).toMatchObject({ phase: 'updated', completedPacks: 6, downloadedBytes: 24576 });
  });
  it('rejects invalid signatures, duplicate partitions, wrong license and oversized packs', () => {
    expect(verifyPackManifest(envelope(), publicKey).packs).toHaveLength(2);
    expect(() => verifyPackManifest({ ...envelope(), signature: '0'.repeat(128) }, publicKey)).toThrow();
    for (const packs of [[a, a], [{ ...a, license: 'ODbL-1.0' }], [{ ...a, bytes: 33 * 1024 * 1024 }], [{ ...a, bucket: 1 }]]) {
      expect(() => verifyPackManifest(envelope(packs as FoodPack[]), publicKey)).toThrow();
    }
  });
  it('checkpoints good packs and resumes failures without redownloading completed data', async () => {
    const fake = storage(); fake.setFailure(a.id);
    const updater = createPackUpdater(fake.value, publicKey, () => 1000, () => 0);
    await updater.check();
    expect(fake.installed.map(item => item.id)).toEqual([b.id]);
    expect(fake.retirements()).toBe(0);
    expect(updater.getStatus()).toMatchObject({ phase: 'error', nextCheck: 3601000, completedPacks: 1, totalPacks: 2 });
    fake.setFailure();
    const restarted = createPackUpdater(fake.value, publicKey, () => 3601001, () => 0);
    await restarted.check();
    expect(fake.attempts).toEqual([a.id, b.id, a.id]);
    expect(restarted.getStatus()).toMatchObject({ phase: 'updated', version: 'us-v1', failures: 0, completedPacks: 2 });
    expect(fake.retirements()).toBe(1);
  });
  it('keeps the old version usable when its replacement fails', async () => {
    const fake = storage(); fake.installed.push({ ...a, sha256: 'b'.repeat(64), version: 'old' }); fake.setFailure(a.id);
    await createPackUpdater(fake.value, publicKey).check(true);
    expect(fake.installed.find(item => item.id === a.id)?.version).toBe('old');
  });
  it('skips unchanged packs and coalesces simultaneous automatic checks', async () => {
    const fake = storage(); fake.installed.push(a, b);
    const updater = createPackUpdater(fake.value, publicKey);
    await Promise.all([updater.check(), updater.check()]);
    expect(fake.attempts).toEqual([]);
    expect(updater.getStatus().phase).toBe('current');
  });
  it('ignores a tampered manifest before any installation', async () => {
    const fake = storage(); fake.value.fetchManifest = async () => ({ ...envelope(), payload: envelope().payload.replace('us-v1', 'us-v2') });
    const updater = createPackUpdater(fake.value, publicKey); await updater.check();
    expect(fake.installed).toEqual([]);
    expect(updater.getStatus().phase).toBe('error');
  });
  it('repairs an unavailable pack even when its signed descriptor is unchanged', async () => {
    const fake = storage(); fake.installed.push(a, b);
    fake.value.available = async descriptor => descriptor.id !== a.id;
    await createPackUpdater(fake.value, publicKey).check(true);
    expect(fake.attempts).toEqual([a.id]);
  });
});
describe('bounded expansion reader', () => {
  it('uses durable USDA routes after recreation and opens no packs for indexed misses', async () => {
    const target = { ...a, id: 'usda-branded-2-1', buckets: 2, bucket: 1 };
    const unrelated = { ...a, id: 'usda-branded-2-0', buckets: 2, bucket: 0 };
    const food = normalizeUsdaBranded(usda)!;
    const opened: string[] = [];
    const reader = createPackCatalog(async () => [unrelated, target], async (pack, work) => {
      opened.push(pack.id); return work({ getFood: async id => id === food.id && pack.id === target.id ? food : null, search: async () => [], barcode: async () => null });
    }, { getFood: async () => null, search: async () => [], barcode: async () => null },
    async id => ({ packs: id === food.id ? [target] : [], complete: true }));
    expect((await reader.getFood(food.id))?.id).toBe(food.id); expect(opened).toEqual([target.id]);
    opened.length = 0; expect(await reader.getFood('usda-999999')).toBeNull(); expect(opened).toEqual([]);
  });
  it('returns a bundled core identity without opening or hashing expansion packs', async () => {
    const food = { ...normalizeUsdaBranded(usda)!, id: 'usda-171287', brand: undefined, name: 'Egg, whole, raw' };
    let opened = 0;
    const core: FoodCatalog = { getFood: async id => id === food.id ? food : null, search: async () => [food], barcode: async () => null };
    const reader = createPackCatalog(async () => [a, b], async (_pack, work) => { opened++; return work(core); }, core);
    expect((await reader.getFood(food.id))?.name).toBe('Egg, whole, raw');
    expect(opened).toBe(0);
  });
  it('prefers USDA barcodes while preserving both name-search records', async () => {
    const foods = [normalizeUsdaBranded(usda)!, normalizeOffProduct(off)!];
    let opened = 0, highWater = 0;
    const empty: FoodCatalog = { getFood: async () => null, search: async () => [], barcode: async () => null };
    const reader = createPackCatalog(async () => [b, a], async (descriptor, work) => {
      opened++; highWater = Math.max(highWater, opened);
      const food = foods[descriptor.source === 'off' ? 1 : 0];
      try { return await work({ getFood: async id => food.id === id ? food : null, search: async () => [food], barcode: async () => food }); }
      finally { opened--; }
    }, empty);
    expect((await reader.barcode('0030771094625'))?.id).toBe('usda-1892562');
    expect((await reader.search('al fresco apple maple')).map(food => food.id).sort()).toEqual(['off-0030771094625', 'usda-1892562']);
    expect(highWater).toBe(1);
  });
  it('prefers the newest installed generation during overlapping partitions', async () => {
    const old = { ...b, id: 'off-1-0' }, next = { ...b, id: 'off-2-1', buckets: 2, bucket: 1 };
    const food = normalizeOffProduct(off)!;
    const reader = createPackCatalog(async () => [old, next], async (pack, work) => {
      const version = { ...food, calories: pack.id === old.id ? 100 : 180 };
      return work({ getFood: async () => version, search: async () => [version], barcode: async () => version });
    }, { getFood: async () => null, search: async () => [], barcode: async () => null });
    expect((await reader.barcode('030771094625'))?.calories).toBe(180);
    expect((await reader.search('al fresco'))[0]?.calories).toBe(180);
    expect((await reader.getFood(food.id))?.calories).toBe(180);
  });
  it('retains core results when a pack fails and reports the source issue', async () => {
    const food = normalizeUsdaBranded(usda)!;
    const core: FoodCatalog = { getFood: async () => food, search: async () => [food], barcode: async () => food };
    const reader = createPackCatalog(async () => [b], async () => { throw new Error('corrupt pack'); }, core);
    const window = await reader.searchWindow!('al fresco');
    expect(window.foods).toHaveLength(1);
    expect(window.issues?.[0]?.source).toBe('Open Food Facts');
  });
  it('searches valid packs even when the core catalog is unavailable', async () => {
    const food = normalizeOffProduct(off)!;
    const missing: FoodCatalog = { getFood: async () => null, search: async () => { throw new Error('no core'); }, barcode: async () => null };
    const reader = createPackCatalog(async () => [b], async (_pack, work) => work({ getFood: async () => food, search: async () => [food], barcode: async () => food }), missing);
    expect((await reader.searchWindow!('al fresco')).foods.map(food => food.id)).toEqual(['off-0030771094625']);
  });
});
