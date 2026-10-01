import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import { serialized, type SqliteConnection } from '../local/database';
import { createPackSearchIndex } from './pack-search-index';
const queues = new Map<string, SqliteConnection>();
export function createNativePackSearch(directory: string) {
  const queue = queues.get(directory) ?? {} as SqliteConnection;
  queues.set(directory, queue);
  const index = createPackSearchIndex((_write, work) => serialized(queue, async () => {
    const db = await SQLite.openDatabaseAsync('food-search.sqlite', { useNewConnection: true, finalizeUnusedStatementsBeforeClosing: false }, directory);
    try {
      await db.execAsync('PRAGMA journal_mode=WAL; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-4096;');
      return await work(db);
    } finally { await db.closeAsync(); }
  }));
  return { ...index, reset: () => serialized(queue, async () => {
    // This is derived data. Repair never removes verified canonical packs.
    for (const name of ['food-search.sqlite', 'food-search.sqlite-wal', 'food-search.sqlite-shm']) {
      const file = new File(directory, name); if (file.exists) file.delete();
    }
  }) };
}
