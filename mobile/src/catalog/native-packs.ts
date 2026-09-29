import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { serialized, type SqliteConnection } from '../local/database';
import { createCatalogReader } from './queries';
import { packSchema, inspectFoodPack, type FoodPack, type PackStorage } from './packs';
import type { UpdateState } from './updater';
import type { FoodCatalog } from '../local/repository';

export async function createNativePackStorage(
  metadata: <T>(key: string) => Promise<T | null>, saveMetadata: (key: string, value: unknown) => Promise<unknown>, manifestUrl: string,
): Promise<PackStorage & { withReader<T>(pack: FoodPack, work: (reader: FoodCatalog) => Promise<T>): Promise<T> }> {
  const directory = new Directory(Paths.document, 'gramello-food-packs');
  directory.create({ intermediates: true, idempotent: true });
  const queue = {} as SqliteConnection;
  const stored = await metadata<{ active: unknown[]; previous: unknown[] }>('foodPackIndex');
  const descriptors = (values: unknown[] = []) => values.flatMap(value => { const parsed = packSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  let installed = descriptors(stored?.active), previous = descriptors(stored?.previous);
  const fileFor = (pack: FoodPack) => new File(directory, `pack-${pack.sha256}.sqlite`);
  const list = async () => installed.filter(pack => fileFor(pack).exists);
  const digest = async (file: File) => Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(await file.bytes()))), b => b.toString(16).padStart(2, '0')).join('');
  const open = async (file: File) => {
    const db = await SQLite.openDatabaseAsync(file.name, { useNewConnection: true, finalizeUnusedStatementsBeforeClosing: false }, directory.uri);
    try { await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;'); return db; }
    catch (error) { await db.closeAsync(); throw error; }
  };
  return {
    list,
    async available(pack) {
      const file = fileFor(pack);
      return file.exists && file.size === pack.bytes && await digest(file) === pack.sha256;
    },
    load: async () => await metadata<UpdateState>('foodPacksUpdate') ?? {},
    save: async state => { await saveMetadata('foodPacksUpdate', state); },
    async fetchManifest() {
      const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('US product downloads are unavailable. Installed foods remain usable.');
      const text = await response.text(); if (text.length > 520000) throw new Error('Pack manifest is too large.');
      return JSON.parse(text);
    },
    async install(pack) {
      if (Paths.availableDiskSpace < pack.bytes * 2 + 10 * 1024 * 1024) throw new Error('Free some device storage to download US products.');
      const file = fileFor(pack);
      try {
        // No network-type gate: cellular downloads are explicitly enabled.
        if (!file.exists) await File.downloadFileAsync(pack.url, file, { signal: AbortSignal.timeout(120000) });
        if (file.size !== pack.bytes || await digest(file) !== pack.sha256) {
          // Remove only this corrupt content-addressed download, so retry does
          // not keep reusing an incomplete file. The prior version is untouched.
          if (file.exists) file.delete();
          throw new Error('The food pack did not pass verification.');
        }
        await serialized(queue, async () => { const db = await open(file); try { await inspectFoodPack(db, pack); } finally { await db.closeAsync(); } });
        const next = [...installed.filter(old => old.id !== pack.id), pack];
        const old = installed.find(old => old.id === pack.id && old.sha256 !== pack.sha256);
        const prior = old ? [...previous.filter(item => item.id !== pack.id), old] : previous;
        // Never save personal metadata while holding the catalog reader queue.
        await saveMetadata('foodPackIndex', { active: next, previous: prior }); installed = next; previous = prior;
      } catch (error) {
        if (!installed.some(old => old.sha256 === pack.sha256) && file.exists) { try { file.delete(); } catch { /* Retry can clean an incomplete download. */ } }
        throw error;
      }
    },
    async retire(wanted) {
      const next = installed.filter(old => wanted.some(pack => pack.id === old.id && pack.sha256 === old.sha256));
      const prior = previous.filter(old => next.some(pack => pack.id === old.id));
      await saveMetadata('foodPackIndex', { active: next, previous: prior }); installed = next; previous = prior;
      await serialized(queue, async () => {
        const keep = new Set([...installed, ...previous].map(pack => fileFor(pack).name));
        for (const entry of directory.list()) if (entry instanceof File && /^pack-[a-f0-9]{64}\.sqlite$/.test(entry.name) && !keep.has(entry.name)) {
          try { entry.delete(); } catch { /* A later successful update can retry cleanup. */ }
        }
      });
    },
    withReader: (pack, work) => serialized(queue, async () => {
      const file = fileFor(pack);
      if (!file.exists || file.size !== pack.bytes || await digest(file) !== pack.sha256) throw new Error('A downloaded food pack is unavailable or corrupt. Check for updates.');
      const db = await open(file);
      try { return await work(createCatalogReader(read => read(db))); }
      finally { await db.closeAsync(); }
    }),
  };
}
