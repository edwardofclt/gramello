import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createCatalogUpdater, type UpdateStorage } from '../mobile/src/catalog/updater';
import { verifyManifest } from '../mobile/src/catalog/format';
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const manifest = { schemaVersion: 1, version: '2026-09-22.1', publishedAt: '2026-09-22T00:00:00Z', url: 'https://github.com/edwardofclt/gramello/releases/download/catalog-1/foods.sqlite', bytes: 4096, sha256: 'a'.repeat(64), count: 100 };
function signed(value: unknown) { const payload = JSON.stringify(value); return { payload, signature: sign(null, Buffer.from(payload), keys.privateKey).toString('hex') }; }
function fixture() {
  let installed = 'starter', saved: Record<string, unknown> = {};
  let downloads = 0, checks = 0, rejectInstall = false;
  const storage: UpdateStorage = {
    async load() { return saved; }, async save(state) { saved = state; },
    async fetchManifest() { checks++; return signed(manifest); },
    async install() { downloads++; if (rejectInstall) throw new Error('Invalid hash'); installed = manifest.version; },
  };
  const updater = createCatalogUpdater(storage, publicKey, () => 100000000, () => 0);
  return { updater, storage, setBad: () => { rejectInstall = true; }, installed: () => installed, checks: () => checks, downloads: () => downloads };
}
describe('catalog updates', () => {
  it('accepts a signed compatible manifest and rejects modified signatures, schemas and non-HTTPS assets', () => {
    expect(verifyManifest(signed(manifest), publicKey)).toEqual(manifest);
    expect(() => verifyManifest({ ...signed(manifest), payload: JSON.stringify({ ...manifest, count: 999 }) }, publicKey)).toThrow();
    expect(() => verifyManifest(signed({ ...manifest, schemaVersion: 2 }), publicKey)).toThrow();
    expect(() => verifyManifest(signed({ ...manifest, url: 'http://example.com/data' }), publicKey)).toThrow();
  });
  it('installs silently once, coalesces checks, and lets manual checking bypass the daily interval', async () => {
    const f = fixture();
    await Promise.all([f.updater.check(), f.updater.check()]);
    expect(f.installed()).toBe(manifest.version);
    expect(f.downloads()).toBe(1);
    await f.updater.check(); expect(f.checks()).toBe(1);
    await f.updater.check(true); expect(f.checks()).toBe(2); expect(f.downloads()).toBe(1);
  });
  it('keeps the installed catalog after a failed install and retries on manual request', async () => {
    const f = fixture(); f.setBad();
    await f.updater.check();
    expect(f.installed()).toBe('starter');
    expect(f.updater.getStatus()).toMatchObject({ phase: 'error', error: 'Invalid hash' });
    await f.updater.check(); expect(f.downloads()).toBe(1);
    await f.updater.check(true); expect(f.downloads()).toBe(2);
  });
  it('does not claim an update succeeded if persisting its state fails', async () => {
    const f = fixture();
    f.storage.save = async () => { throw new Error('Storage full'); };
    await f.updater.check();
    expect(f.updater.getStatus().phase).toBe('error');
  });
});
