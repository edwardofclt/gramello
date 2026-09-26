import { beforeAll, describe, expect, it } from 'vitest';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { openMemoryDatabase, type SqliteModule } from '../lib/browser-local/sqlite';
import { createLocalRepository } from '../mobile/src/local/repository';

let sqlite: SqliteModule;
beforeAll(async () => { sqlite = await sqlite3InitModule() as unknown as SqliteModule; });
const catalog = { async getFood() { return null; }, async search() { return []; }, async barcode() { return null; } };

describe('the browser SQLite adapter', () => {
  it('uses the native repository and reopens a durable snapshot with FTS5 available', async () => {
    const first = openMemoryDatabase(sqlite);
    const repo = await createLocalRepository(first, catalog);
    await repo.addWater({ date: '2026-09-26', amountMl: 250 });
    await first.execAsync('CREATE VIRTUAL TABLE search_test USING fts5(name);');
    await first.runAsync('INSERT INTO search_test VALUES(?)', 'apple');
    const bytes = first.export(); first.close();
    const second = openMemoryDatabase(sqlite, bytes);
    try {
      const reopened = await createLocalRepository(second, catalog);
      expect((await reopened.getWaterDay('2026-09-26')).totalMl).toBe(250);
      expect(await second.getFirstAsync<{ name: string }>('SELECT name FROM search_test WHERE search_test MATCH ?', 'app*')).toEqual({ name: 'apple' });
      await reopened.addWater({ date: '2026-09-26', amountMl: 500 });
      expect((await reopened.getWaterDay('2026-09-26')).totalMl).toBe(750);
    } finally { second.close(); }
  });

  it('keeps an imported native backup and its recovery through snapshot reload', async () => {
    const first = openMemoryDatabase(sqlite);
    const repo = await createLocalRepository(first, catalog);
    await repo.addWater({ date: '2026-09-26', amountMl: 300 });
    await repo.importArchive(JSON.stringify({ format: 'gramello', version: 1, exportedAt: new Date().toISOString(), records: [] }));
    const bytes = first.export(); first.close();
    const second = openMemoryDatabase(sqlite, bytes);
    try {
      const reopened = await createLocalRepository(second, catalog);
      expect((await reopened.exportArchive()).records).toEqual([]);
      expect(await reopened.hasRecovery()).toBe(true);
      await reopened.restorePrevious();
      expect((await reopened.getWaterDay('2026-09-26')).totalMl).toBe(300);
    } finally { second.close(); }
  });
});
