import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createBrowserPackStorage, readPackDownload } from '../lib/browser-local/packs';
import type { FoodPack } from '../mobile/src/catalog/packs';
import type { SnapshotStore } from '../lib/browser-local/persistence';
import { testDatabase } from './helpers/local-sqlite';
import nacl from 'tweetnacl';
import { createPackUpdater } from '../mobile/src/catalog/packs';

const bytes = new Uint8Array(4096), hash = createHash('sha256').update(bytes).digest('hex');
const pack: FoodPack = { schemaVersion: 1, id: 'off-1-0', source: 'off', license: 'ODbL-1.0', market: 'US', bucket: 0, buckets: 1, version: 'off-v1', count: 1, bytes: bytes.length, sha256: hash, url: 'https://example.org/off.sqlite' };
const databases: ReturnType<typeof testDatabase>[] = [];
afterEach(() => { for (const db of databases.splice(0)) { if (db.raw.isOpen) db.raw.close(); } });
function setup(fetcher?: typeof fetch) {
  const values = new Map<string, unknown>();
  const reads: string[] = [];
  let rejectCommit = false, closed = 0;
  const store: SnapshotStore = { read: async <T>(key: string) => { reads.push(key); return values.get(key) as T | undefined; },
    commit: async pairs => { if (rejectCommit) throw new Error('quota'); for (const [key, value] of pairs) values.set(key, value); } };
  const queues = new Map<string, Promise<unknown>>();
  const options = { store, lock: async <T>(name: string, work: () => Promise<T>) => {
    const next = (queues.get(name) ?? Promise.resolve()).then(work); queues.set(name, next.catch(() => {})); return next;
  }, open: (input: Uint8Array) => {
    const db = testDatabase(); databases.push(db);
    db.raw.exec(`PRAGMA user_version=1; CREATE TABLE catalog_meta(key TEXT,value TEXT); CREATE TABLE foods(id TEXT,food TEXT); CREATE VIRTUAL TABLE food_search USING fts5(id,name);
      INSERT INTO catalog_meta VALUES('version','off-v1'),('pack_source','off'),('market','US'),('license','ODbL-1.0');
      INSERT INTO foods VALUES('off-030771094625','{"id":"off-030771094625","name":"Sausage","source":"Open Food Facts","servingGrams":50,"servingLabel":"1 patty","calories":180,"protein":18,"carbs":10,"fat":8}');
      INSERT INTO food_search VALUES('off-030771094625','Sausage');`);
    if (input[0] === 1) db.raw.exec("UPDATE catalog_meta SET value='off-v2' WHERE key='version'");
    return { ...db.db, close: () => { db.raw.close(); closed++; } };
  }, fetcher: fetcher ?? (async () => new Response(bytes)), manifestUrl: '/manifest' };
  const storage = createBrowserPackStorage(options);
  return { storage, options, values, reads, reject: () => { rejectCommit = true; }, closed: () => closed };
}
describe('durable browser expansion storage', () => {
  it('clears unused previous copies without copying the replaced bytes', async () => {
    const fake = setup(); await fake.storage.install(pack);
    fake.values.set('packs:previous:' + pack.id, bytes);
    const nextBytes = new Uint8Array(4096).fill(1), next = { ...pack, version: 'off-v2', sha256: createHash('sha256').update(nextBytes).digest('hex') };
    const nextStorage = createBrowserPackStorage({ ...fake.options, fetcher: async () => new Response(nextBytes) });
    await nextStorage.install(next);
    expect(fake.values.get('packs:previous:' + pack.id)).toBeUndefined();
  });
  it('does not open a different activated hash under a stale caller descriptor', async () => {
    const fake = setup(); await fake.storage.install(pack);
    const nextBytes = new Uint8Array(4096).fill(1), next = { ...pack, version: 'off-v2', sha256: createHash('sha256').update(nextBytes).digest('hex') };
    await createBrowserPackStorage({ ...fake.options, fetcher: async () => new Response(nextBytes) }).install(next);
    fake.reads.length = 0;
    await expect(fake.storage.withReader(pack, r => r.getFood('off-030771094625'))).rejects.toThrow();
    expect(fake.reads).not.toContain('packs:' + pack.id);
  });
  it('distinguishes publisher transitions from ordinary transfer errors', async () => {
    const fake = setup(async () => new Response(null, { status: 409 }));
    await expect(fake.storage.install(pack)).rejects.toMatchObject({ name: 'PackManifestChangedError' });
  });
  it('cancels an oversized UTF-8 manifest before buffering its remainder', async () => {
    let cancelled = false;
    const body = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode('é'.repeat(260001))); },
      cancel() { cancelled = true; },
    });
    const fake = setup(async () => new Response(body));
    await expect(fake.storage.fetchManifest()).rejects.toThrow(/large|exceed/);
    expect(cancelled).toBe(true);
  });
  it('activates bytes and descriptor together and can read them after reopening', async () => {
    const fake = setup(); await fake.storage.install(pack);
    expect(await fake.storage.list()).toEqual([pack]);
    expect(await fake.storage.withReader(pack, reader => reader.getFood('off-030771094625'))).toMatchObject({ name: 'Sausage' });
    expect(fake.closed()).toBe(2);
  });
  it('preserves the previous pack when a storage commit fails', async () => {
    const fake = setup(); await fake.storage.install(pack); fake.reject();
    await expect(fake.storage.install({ ...pack, url: 'https://example.org/next.sqlite' })).rejects.toThrow('quota');
    expect(await fake.storage.list()).toEqual([pack]);
    expect(fake.closed()).toBe(2);
  });
  it('reports streamed bytes before the download completes', async () => {
    const seen: number[] = [];
    const source = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(1024));
      controller.enqueue(new Uint8Array(3072));
      controller.close();
    } });
    const result = await readPackDownload(new Response(source), 4096, bytes => { seen.push(bytes); });
    expect(result.length).toBe(4096);
    expect(seen).toEqual([1024, 4096]);
  });
  it('rejects incomplete and oversized download streams', async () => {
    await expect(readPackDownload(new Response(new Uint8Array(3)), 4096)).rejects.toThrow('incomplete');
    const source = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4097)); } });
    await expect(readPackDownload(new Response(source), 4096)).rejects.toThrow('exceeds');
  });
  it('does not activate a hash mismatch', async () => {
    const fake = setup(); await expect(fake.storage.install({ ...pack, sha256: '0'.repeat(64) })).rejects.toThrow('verification');
    expect(await fake.storage.list()).toEqual([]);
  });
  it('marks corrupt persisted bytes as unavailable so updates can repair them', async () => {
    const fake = setup(); await fake.storage.install(pack);
    fake.values.set('packs:off-1-0', new Uint8Array(4096).fill(1));
    expect(await fake.storage.available!(pack)).toBe(false);
  });
  it('serializes whole updates across tabs so older retirement cannot erase newer packs', async () => {
    const keys = nacl.sign.keyPair(), hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
    const nextBytes = new Uint8Array(4096).fill(1);
    const next = { ...pack, version: 'off-v2', sha256: createHash('sha256').update(nextBytes).digest('hex') };
    let manifestCalls = 0, release!: () => void, started!: () => void;
    const downloading = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fake = setup(async url => {
      if (url === '/manifest') {
        const current = ++manifestCalls === 1 ? pack : next;
        const payload = JSON.stringify({ schemaVersion: 2, version: current.version, publishedAt: '2026-09-29T00:00:00Z', packs: [current] });
        return Response.json({ payload, signature: hex(nacl.sign.detached(new TextEncoder().encode(payload), keys.secretKey)) });
      }
      if (String(url).includes(pack.sha256)) { started(); await gate; return new Response(bytes); }
      return new Response(nextBytes);
    });
    const oldTab = createPackUpdater(fake.storage, hex(keys.publicKey));
    const newTab = createPackUpdater(createBrowserPackStorage(fake.options), hex(keys.publicKey));
    const first = oldTab.check(true); await downloading;
    const second = newTab.check(true);
    await new Promise(resolve => setTimeout(resolve, 10));
    const callsWhileOldDownloadRuns = manifestCalls;
    release(); await Promise.all([first, second]);
    expect(callsWhileOldDownloadRuns).toBe(1);
    expect((await fake.storage.list())[0]?.version).toBe('off-v2');
    expect(newTab.getStatus().phase).toBe('updated');
  });
});
