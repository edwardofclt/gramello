import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { fetch } from 'expo/fetch';
import { consumeBoundedResponse, readPackManifestResponse } from './downloads';
import { readPackIds, type PackRouteLookup } from './pack-routes';
import { createNativePackRoutes } from './native-pack-routes';
import { serialized, type SqliteConnection } from '../local/database';
import { createCatalogReader } from './queries';
import { packSchema, inspectFoodPack, type FoodPack, type PackStorage } from './packs';
import type { UpdateState } from './updater';
import type { FoodCatalog } from '../local/repository';

// Process-local ownership survives storage recreation, but not app termination.
const liveTransfers = new Set<string>();

// Distinguish damaged bytes from a conflicting descriptor for a valid file.
class InvalidPackFile extends Error {}

export async function createNativePackStorage(
  metadata: <T>(key: string) => Promise<T | null>, saveMetadata: (key: string, value: unknown) => Promise<unknown>, manifestUrl: string,
  options: { fetcher?: typeof fetch } = {},
): Promise<PackStorage & { routes: PackRouteLookup; withReader<T>(pack: FoodPack, work: (reader: FoodCatalog) => Promise<T>): Promise<T> }> {
  const fetcher = options.fetcher ?? fetch;
  const directory = new Directory(Paths.document, 'gramello-food-packs');
  directory.create({ intermediates: true, idempotent: true });
  const queue = {} as SqliteConnection;
  const routeIndex = createNativePackRoutes(directory.uri);
  const metadataQueue = {} as SqliteConnection;
  const pendingInstalls = new Set<Promise<void>>();
  const installingFiles = new Map<string, number>();
  const installQueues = new Map<string, SqliteConnection>();
  const stored = await metadata<{ active: unknown[]; previous: unknown[] }>('foodPackIndex');
  const descriptors = (values: unknown[] = []) => values.flatMap(value => { const parsed = packSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  let installed = descriptors(stored?.active), previous = descriptors(stored?.previous);
  const fileFor = (pack: FoodPack) => new File(directory, `pack-${pack.sha256}.sqlite`);
  const list = async () => installed.filter(pack => fileFor(pack).exists);
  // A receipt is created only after hashing and inspecting the installed bytes.
  // Bump this revision when inspectFoodPack's validation rules change.
  const validationRevision = 1;
  const receiptFor = (pack: FoodPack) => new File(directory, `pack-${pack.sha256}.verified.json`);
  const identity = (pack: FoodPack, file: File) => ({ revision: validationRevision, sha256: pack.sha256,
    version: pack.version, count: pack.count, source: pack.source, license: pack.license,
    bytes: file.size, modificationTime: file.info().modificationTime ?? null });
  const cachedReceipts = new Map<string, ReturnType<typeof identity>>();
  const readReceipt = async (pack: FoodPack) => {
    const cached = cachedReceipts.get(pack.sha256); if (cached) return cached;
    const receipt = receiptFor(pack);
    if (!receipt.exists || receipt.size > 2048) return null;
    try { return JSON.parse(await receipt.text()) as ReturnType<typeof identity>; } catch { return null; }
  };
  const matches = (saved: ReturnType<typeof identity> | null, expected: ReturnType<typeof identity>) =>
    saved !== null && expected.modificationTime !== null && Number.isFinite(expected.modificationTime)
      && Object.entries(expected).every(([key, value]) => saved[key as keyof typeof saved] === value);
  const verified = async (pack: FoodPack, file: File) => matches(await readReceipt(pack), identity(pack, file));
  const digest = async (file: File) => Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(await file.bytes()))), b => b.toString(16).padStart(2, '0')).join('');
  const open = async (file: File) => {
    const db = await SQLite.openDatabaseAsync(file.name, { useNewConnection: true, finalizeUnusedStatementsBeforeClosing: false }, directory.uri);
    try { await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;'); return db; }
    catch (error) { await db.closeAsync(); throw error; }
  };
  const saveReceipt = (pack: FoodPack, stamp: ReturnType<typeof identity>) => {
    cachedReceipts.delete(pack.sha256);
    cachedReceipts.set(pack.sha256, stamp);
    if (cachedReceipts.size > 1024) cachedReceipts.delete(cachedReceipts.keys().next().value!);
    try { receiptFor(pack).write(JSON.stringify(stamp)); }
    catch { /* Verified packs remain usable when receipt persistence fails. */ }
  };
  const verify = async (pack: FoodPack, file: File, force = false, receipt = true) => {
    if (!file.exists || file.size !== pack.bytes) {
      // The incoming manifest may conflict with an already activated descriptor.
      // Its claimed size alone is not evidence that those retained bytes broke.
      if (file.exists && [...installed, ...previous].some(old => old.sha256 === pack.sha256 && old.bytes === file.size)) throw new Error('The food pack size does not match its descriptor.');
      throw new InvalidPackFile('A downloaded food pack is unavailable or corrupt. Check for updates.');
    }
    if (!force && await verified(pack, file)) return;
    const before = identity(pack, file);
    if (await digest(file) !== pack.sha256) throw new InvalidPackFile('The food pack did not pass verification.');
    const db = await open(file);
    try { await inspectFoodPack(db, pack); } finally { await db.closeAsync(); }
    if (JSON.stringify(before) !== JSON.stringify(identity(pack, file))) throw new InvalidPackFile('The food pack changed during verification.');
    // Sidecars avoid acquiring the personal database queue from a catalog read:
    // getFood may already hold that queue while resolving an installed food.
    if (receipt) saveReceipt(pack, before);
  };
  const index = async (pack: FoodPack) => {
    if (pack.source !== 'usda-branded' || await routeIndex.indexed(pack)) return;
    await verify(pack, fileFor(pack));
    const pages: string[][] = [], db = await open(fileFor(pack));
    try { await readPackIds(db, async ids => { pages.push(ids); }); }
    finally { await db.closeAsync(); }
    await routeIndex.index(pack, pages);
  };
  return {
    list,
    recover: () => serialized(queue, async () => {
      for (const entry of directory.list()) if (entry instanceof File
        && /^pack-[a-f0-9]{64}-\d+-[a-f0-9]*\.partial$/.test(entry.name) && !liveTransfers.has(entry.uri)) entry.delete();
    }),
    routes: (id, _installed) => serialized(queue, async () => {
      const current = await list();
      const route = await routeIndex.lookup(id, current);
      if (route.complete) return route;
      for (const pack of current) await index(pack);
      return routeIndex.lookup(id, current);
    }),
    async available(pack) {
      return serialized(queue, async () => {
        const file = fileFor(pack);
        if (!file.exists || file.size !== pack.bytes) return false;
        const saved = await readReceipt(pack), expected = identity(pack, file);
        // The updater calls available for every pack. Legacy or obsolete receipts
        // defer whole-file validation until that pack is actually queried.
        if (!saved || saved.revision !== validationRevision || expected.modificationTime === null
          || !Number.isFinite(expected.modificationTime)) return true;
        return matches(saved, expected);
      });
    },
    load: async () => await metadata<UpdateState>('foodPacksUpdate') ?? {},
    save: async state => { await saveMetadata('foodPacksUpdate', state); },
    async fetchManifest() {
      const response = await fetcher(manifestUrl, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('US product downloads are unavailable. Installed foods remain usable.');
      return readPackManifestResponse(response);
    },
    async install(pack, onProgress) {
      const name = fileFor(pack).name;
      installingFiles.set(name, (installingFiles.get(name) ?? 0) + 1);
      const installQueue = installQueues.get(name) ?? {} as SqliteConnection;
      installQueues.set(name, installQueue);
      const task = serialized(installQueue, async () => {
        if (Paths.availableDiskSpace < pack.bytes * 2 + 10 * 1024 * 1024) throw new Error('Free some device storage to download US products.');
        const file = fileFor(pack);
        let temporary: File | undefined, transferPath: string | undefined;
        try {
          const reusable = await serialized(queue, async () => {
            if (!file.exists) return false;
            try { await verify(pack, file, true); return true; }
            catch (error) {
              const retained = [...installed, ...previous].some(old => old.sha256 === pack.sha256);
              if (retained && !(error instanceof InvalidPackFile)) throw error;
              file.delete(); cachedReceipts.delete(pack.sha256);
              const receipt = receiptFor(pack); if (receipt.exists) receipt.delete();
              return false;
            }
          });
          if (!reusable) {
            temporary = new File(directory, `pack-${pack.sha256}-${Date.now()}-${Math.random().toString(16).slice(2)}.partial`);
            transferPath = temporary.uri; liveTransfers.add(transferPath);
            temporary.create();
            const handle = temporary.open();
            try {
              const response = await fetcher(pack.url, { signal: AbortSignal.timeout(120000) });
              await consumeBoundedResponse(response, { maxBytes: pack.bytes, exactBytes: pack.bytes }, chunk => handle.writeBytes(chunk), onProgress);
            } finally { handle.close(); }
            const staged = temporary;
            // Candidates have independent read-only connections; activation owns the reader queue.
            await verify(pack, staged, true, false);
            await serialized(queue, async () => {
              staged.move(file); temporary = undefined;
              saveReceipt(pack, identity(pack, file));
            });
          }
          await serialized(queue, () => index(pack));
          await serialized(metadataQueue, async () => {
            const next = [...installed.filter(old => old.id !== pack.id), pack];
            const old = installed.find(old => old.id === pack.id && old.sha256 !== pack.sha256);
            const prior = old ? [...previous.filter(item => item.id !== pack.id), old] : previous;
            // Never save personal metadata while holding the catalog reader queue.
            await saveMetadata('foodPackIndex', { active: next, previous: prior }); installed = next; previous = prior;
          });
        } catch (error) {
          if (temporary?.exists) { try { temporary.delete(); } catch { /* Retry reclaims abandoned staging files. */ } }
          throw error;
        } finally { if (transferPath) liveTransfers.delete(transferPath); }
      });
      pendingInstalls.add(task);
      try { await task; }
      finally {
        pendingInstalls.delete(task);
        const remaining = installingFiles.get(name)! - 1;
        if (remaining) installingFiles.set(name, remaining);
        else { installingFiles.delete(name); installQueues.delete(name); }
      }
    },
    async retire(wanted) {
      // Finish installs already requested before computing the retirement index.
      await Promise.allSettled([...pendingInstalls]);
      await serialized(metadataQueue, async () => {
        const next = installed.filter(old => wanted.some(pack => pack.id === old.id && pack.sha256 === old.sha256));
        const prior = previous.filter(old => next.some(pack => pack.id === old.id));
        await saveMetadata('foodPackIndex', { active: next, previous: prior }); installed = next; previous = prior;
      });
      await serialized(queue, async () => {
        await routeIndex.retire(installed);
        const keep = new Set([...installed, ...previous].map(pack => fileFor(pack).name));
        for (const name of installingFiles.keys()) keep.add(name);
        for (const hash of cachedReceipts.keys()) if (!keep.has(`pack-${hash}.sqlite`)) cachedReceipts.delete(hash);
        for (const entry of directory.list()) if (entry instanceof File && /^pack-[a-f0-9]{64}\.(sqlite|verified\.json)$/.test(entry.name) && !keep.has(entry.name.replace(/\.verified\.json$/, '.sqlite'))) {
          try { entry.delete(); } catch { /* A later successful update can retry cleanup. */ }
        }
      });
    },
    withReader: (pack, work) => serialized(queue, async () => {
      const file = fileFor(pack);
      await verify(pack, file);
      const db = await open(file);
      try { return await work(createCatalogReader(read => read(db))); }
      finally { await db.closeAsync(); }
    }),
  };
}
