import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import sqlite3Init from '@sqlite.org/sqlite-wasm';
import { createBrowserPackFiles, packFileName } from '../lib/browser-local/pack-files';
import { decodePackEntries } from '../lib/browser-local/pack-entries';
import type { SqliteModule } from '../lib/browser-local/sqlite';
import type { FoodPack } from '../mobile/src/catalog/packs';
let sqlite: SqliteModule;
beforeAll(async () => { sqlite = await sqlite3Init() as unknown as SqliteModule; });
afterEach(() => vi.unstubAllGlobals());
const pack: FoodPack = { schemaVersion: 1, id: 'off-1-0', source: 'off', market: 'US', license: 'ODbL-1.0', bucket: 0, buckets: 1, version: 'v1', url: 'https://example.org/a.sqlite', sha256: 'a'.repeat(64), bytes: 4096, count: 1 };
function filesystem() {
  const files = new Map<string, Uint8Array>(); let closed = 0, written = 0, roots = 0;
  const directory = {
    async getDirectoryHandle() { return directory; },
    async getFileHandle(name: string, options?: { create: boolean }) {
      if (!files.has(name)) { if (!options?.create) throw new DOMException('missing', 'NotFoundError'); files.set(name, new Uint8Array()); }
      return {
        async getFile() { return new File([files.get(name)! as Uint8Array<ArrayBuffer>], name, { lastModified: 1000 }); },
        async createSyncAccessHandle() { return {
          write(bytes: Uint8Array, { at = 0 } = {}) { const old = files.get(name)!; const next = new Uint8Array(Math.max(at + bytes.length, old.length)); next.set(old); next.set(bytes, at); files.set(name, next); written += bytes.length; return bytes.length; },
          truncate(size: number) { files.set(name, new Uint8Array(size)); }, flush() {}, close() { closed++; },
        }; },
      };
    },
    async removeEntry(name: string) { if (!files.delete(name)) throw new DOMException('missing', 'NotFoundError'); },
    async *entries() { for (const name of files.keys()) yield [name, {}]; },
    async *keys() { yield* files.keys(); },
  };
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => { roots++; return directory; } } });
  return { files, backend: createBrowserPackFiles(sqlite)!, closed: () => closed, written: () => written, roots: () => roots };
}
describe('browser file boundary', () => {
  it('reuses its directory capability across operations rather than reacquiring storage handles', async () => {
    const fake = filesystem(); fake.files.set(packFileName(pack), new Uint8Array(4096));
    await fake.backend.stat(pack); await fake.backend.read(pack); await fake.backend.retire([pack]);
    expect(fake.roots()).toBe(1);
  });
  it('decodes legacy and versioned entries without accepting invalid paths or locations', () => {
    expect(decodePackEntries([pack, { format: 1, pack, location: 'opfs' }]).map(entry => entry.location)).toEqual(['indexeddb', 'opfs']);
    expect(decodePackEntries([{ format: 1, pack, location: 'outside' }, { ...pack, sha256: '../../escape' }])).toEqual([]);
    expect(() => packFileName({ ...pack, sha256: '../../escape' })).toThrow();
  });
  it('stops before overflow writes, cancels, closes and removes only its temporary file', async () => {
    const fake = filesystem(); fake.files.set(packFileName(pack), new Uint8Array(4096));
    let cancelled = false;
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4096)); c.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
    await expect(fake.backend.stage(pack, new Response(body))).rejects.toThrow('exceeds');
    expect(cancelled).toBe(true); expect(fake.written()).toBe(4096); expect(fake.closed()).toBe(1);
    expect([...fake.files.keys()]).toEqual([packFileName(pack)]);
  });
  it('keeps referenced files and unrelated content during orphan cleanup', async () => {
    const fake = filesystem(); const kept = packFileName(pack), orphan = `pack-${'b'.repeat(64)}.sqlite`;
    for (const name of [kept, orphan, 'diary.sqlite', 'partial-a.sqlite']) fake.files.set(name, new Uint8Array());
    await fake.backend.retire([pack]); expect([...fake.files.keys()].sort()).toEqual([kept, 'diary.sqlite', 'partial-a.sqlite'].sort());
    await expect(fake.backend.removeTemporary('../../diary.sqlite')).rejects.toThrow('Invalid');
  });
});
