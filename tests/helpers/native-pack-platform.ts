import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { testDatabase } from './local-sqlite';
export const platform = { root: '', reads: 0, writes: [] as number[], missingStamp: false, opened: 0, closed: 0,
  fetcher: (async () => new Response(null, { status: 503 })) as typeof fetch };
export class Directory {
  uri: string;
  constructor(...parts: (string | Directory)[]) { this.uri = join(...parts.map(p => typeof p === 'string' ? p : p.uri)); }
  create() { mkdirSync(this.uri, { recursive: true }); }
  list() { return readdirSync(this.uri).map(name => new File(this, name)); }
}
export class File {
  uri: string;
  constructor(...parts: (string | Directory)[]) { this.uri = join(...parts.map(p => typeof p === 'string' ? p : p.uri)); }
  get name() { return basename(this.uri); }
  get exists() { return existsSync(this.uri); }
  get size() { return statSync(this.uri).size; }
  get lastModified() { return platform.missingStamp ? null : statSync(this.uri).mtimeMs; }
  info() { return { modificationTime: this.lastModified, size: this.size }; }
  async text() { return readFileSync(this.uri, 'utf8'); }
  write(text: string) { writeFileSync(this.uri, text); }
  async bytes() { platform.reads++; return new Uint8Array(readFileSync(this.uri)); }
  create() { closeSync(openSync(this.uri, 'wx')); }
  open() { const fd = openSync(this.uri, 'r+'); return { writeBytes(bytes: Uint8Array) { platform.writes.push(bytes.length); writeSync(fd, bytes); }, close() { closeSync(fd); } }; }
  move(destination: File) { renameSync(this.uri, destination.uri); this.uri = destination.uri; }
  delete() { unlinkSync(this.uri); }
  static async downloadFileAsync(url: string, file: File) {
    const response = await platform.fetcher(url);
    const fd = openSync(file.uri, 'w');
    try { writeSync(fd, new Uint8Array(await response.arrayBuffer())); } finally { closeSync(fd); }
  }
}
export const fileSystem = { Directory, File, Paths: { get document() { return platform.root; }, availableDiskSpace: 1e10 } };
export const cryptoAdapter = { CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, async digest(_algorithm: unknown, bytes: Uint8Array) { return new Uint8Array(createHash('sha256').update(bytes).digest()).buffer; } };
export const sqliteAdapter = { async openDatabaseAsync(name: string, _options: unknown, directory: string) {
  const connection = testDatabase(join(directory, name)); platform.opened++;
  return { ...connection.db, async closeAsync() { connection.raw.close(); platform.closed++; } };
} };
