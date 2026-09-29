import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { fetch } from 'expo/fetch';
import { consumeBoundedResponse, readPackManifestResponse } from './downloads';
import { createPackVerification } from './pack-verification';
import { readPackIds, type PackRouteLookup } from './pack-routes';
import { createNativePackRoutes } from './native-pack-routes';
import { serialized, type SqliteConnection } from '../local/database';
import { createCatalogReader } from './queries';
import { packSchema, inspectFoodPack, type FoodPack, type PackStorage } from './packs';
import type { UpdateState } from './updater';
import type { FoodCatalog } from '../local/repository';

export async function createNativePackStorage(
  metadata: <T>(key: string) => Promise<T | null>, saveMetadata: (key: string, value: unknown) => Promise<unknown>, manifestUrl: string,
): Promise<PackStorage & { routes: PackRouteLookup; withReader<T>(pack: FoodPack, work: (reader: FoodCatalog) => Promise<T>): Promise<T> }> {
  const directory = new Directory(Paths.document, 'gramello-food-packs');
  directory.create({ intermediates: true, idempotent: true });
  const queue = {} as SqliteConnection;
  const routeIndex = createNativePackRoutes(directory.uri);
  const stored = await metadata<{ active: unknown[]; previous: unknown[] }>('foodPackIndex');
  const descriptors = (values: unknown[] = []) => values.flatMap(value => { const parsed = packSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  let installed = descriptors(stored?.active), previous = descriptors(stored?.previous);
  const fileFor = (pack: FoodPack) => new File(directory, `pack-${pack.sha256}.sqlite`);
  const list = async () => installed.filter(pack => fileFor(pack).exists);
  const digest = async (file: File) => Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(await file.bytes()))), b => b.toString(16).padStart(2, '0')).join('');
  const verification = createPackVerification();
  const verified = (file: File, pack: FoodPack, force = false) => file.exists
    ? verification.verify(pack, { bytes: file.size, modifiedAt: file.lastModified }, () => digest(file), force)
    : Promise.resolve(false);
  const open = async (file: File) => {
    const db = await SQLite.openDatabaseAsync(file.name, { useNewConnection: true, finalizeUnusedStatementsBeforeClosing: false }, directory.uri);
    try { await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;'); return db; }
    catch (error) { await db.closeAsync(); throw error; }
  };
  const index = async (pack: FoodPack) => {
    if (pack.source !== 'usda-branded' || await routeIndex.indexed(pack)) return;
    if (!await verified(fileFor(pack), pack)) throw new Error('A downloaded food pack is unavailable or corrupt.');
    const pages: string[][] = [], db = await open(fileFor(pack));
    try { await inspectFoodPack(db, pack); await readPackIds(db, async ids => { pages.push(ids); }); }
    finally { await db.closeAsync(); }
    // Never hold an index connection and nutrition reader simultaneously.
    await routeIndex.index(pack, pages);
  };
  return {
    list,
    routes: (id, _installed) => serialized(queue, async () => {
      const current = await list();
      const route = await routeIndex.lookup(id, current);
      if (route.complete) return route;
      for (const pack of current) await index(pack);
      return routeIndex.lookup(id, current);
    }),
    async available(pack) {
      return serialized(queue, () => verified(fileFor(pack), pack, true));
    },
    load: async () => await metadata<UpdateState>('foodPacksUpdate') ?? {},
    save: async state => { await saveMetadata('foodPacksUpdate', state); },
    async fetchManifest() {
      const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('US product downloads are unavailable. Installed foods remain usable.');
      return readPackManifestResponse(response);
    },
    async install(pack) {
      if (Paths.availableDiskSpace < pack.bytes * 2 + 10 * 1024 * 1024) throw new Error('Free some device storage to download US products.');
      const file = fileFor(pack);
      let temporary: File | undefined;
      try {
        const reusable = await serialized(queue, async () => {
          if (await verified(file, pack, true)) return true;
          verification.invalidate(pack.sha256);
          if (file.exists) file.delete();
          return false;
        });
        if (!reusable) {
          temporary = new File(directory, `pack-${pack.sha256}-${Date.now()}-${Math.random().toString(16).slice(2)}.partial`);
          temporary.create();
          const handle = temporary.open();
          try {
            // No network-type gate: cellular downloads are explicitly enabled.
            const response = await fetch(pack.url, { signal: AbortSignal.timeout(120000) });
            await consumeBoundedResponse(response, { maxBytes: pack.bytes, exactBytes: pack.bytes }, chunk => handle.writeBytes(chunk));
          } finally { handle.close(); }
          const staged = temporary;
          await serialized(queue, async () => {
            if (!await verified(staged, pack, true)) throw new Error('The food pack did not pass verification.');
            const db = await open(staged);
            try { await inspectFoodPack(db, pack); } finally { await db.closeAsync(); }
            await staged.move(file);
            temporary = undefined;
            verification.invalidate(pack.sha256);
            if (!await verified(file, pack, true)) throw new Error('The food pack did not pass verification.');
          });
        } else {
          await serialized(queue, async () => { const db = await open(file); try { await inspectFoodPack(db, pack); } finally { await db.closeAsync(); } });
        }
        await serialized(queue, () => index(pack));
        const next = [...installed.filter(old => old.id !== pack.id), pack];
        const old = installed.find(old => old.id === pack.id && old.sha256 !== pack.sha256);
        const prior = old ? [...previous.filter(item => item.id !== pack.id), old] : previous;
        // Never save personal metadata while holding the catalog reader queue.
        await saveMetadata('foodPackIndex', { active: next, previous: prior }); installed = next; previous = prior;
      } catch (error) {
        if (temporary?.exists) { try { temporary.delete(); } catch { /* Only this failed transfer is disposable. */ } }
        throw error;
      }
    },
    async retire(wanted) {
      const next = installed.filter(old => wanted.some(pack => pack.id === old.id && pack.sha256 === old.sha256));
      const prior = previous.filter(old => next.some(pack => pack.id === old.id));
      await saveMetadata('foodPackIndex', { active: next, previous: prior }); installed = next; previous = prior;
      await serialized(queue, async () => {
        await routeIndex.retire(installed);
        const keep = new Set([...installed, ...previous].map(pack => fileFor(pack).name));
        for (const entry of directory.list()) if (entry instanceof File && /^pack-[a-f0-9]{64}\.sqlite$/.test(entry.name) && !keep.has(entry.name)) {
          try { entry.delete(); verification.invalidate(entry.name.slice(5, -7)); } catch { /* A later successful update can retry cleanup. */ }
        }
      });
    },
    withReader: (pack, work) => serialized(queue, async () => {
      const file = fileFor(pack);
      if (!await verified(file, pack)) throw new Error('A downloaded food pack is unavailable or corrupt. Check for updates.');
      const db = await open(file);
      try { return await work(createCatalogReader(read => read(db))); }
      finally { await db.closeAsync(); }
    }),
  };
}
