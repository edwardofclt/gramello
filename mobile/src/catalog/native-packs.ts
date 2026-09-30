import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { serialized, type SqliteConnection } from '../local/database';
import { createCatalogReader } from './queries';
import { packSchema, inspectFoodPack, type FoodPack, type PackStorage } from './packs';
import type { UpdateState } from './updater';
import type { FoodCatalog } from '../local/repository';

// Distinguish damaged bytes from a conflicting descriptor for a valid file.
class InvalidPackFile extends Error {}

export async function createNativePackStorage(
  metadata: <T>(key: string) => Promise<T | null>, saveMetadata: (key: string, value: unknown) => Promise<unknown>, manifestUrl: string,
): Promise<PackStorage & { withReader<T>(pack: FoodPack, work: (reader: FoodCatalog) => Promise<T>): Promise<T> }> {
  const directory = new Directory(Paths.document, 'gramello-food-packs');
  directory.create({ intermediates: true, idempotent: true });
  const queue = {} as SqliteConnection;
  const mutations = {} as SqliteConnection;
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
  const verify = async (pack: FoodPack, file: File, force = false) => {
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
    cachedReceipts.set(pack.sha256, before);
    try { receiptFor(pack).write(JSON.stringify(before)); }
    catch { /* A full disk must not make a successfully verified food pack unusable. */ }
  };
  return {
    list,
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
      const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('US product downloads are unavailable. Installed foods remain usable.');
      const text = await response.text(); if (text.length > 520000) throw new Error('Pack manifest is too large.');
      return JSON.parse(text);
    },
    install: pack => serialized(mutations, async () => {
      if (Paths.availableDiskSpace < pack.bytes * 2 + 10 * 1024 * 1024) throw new Error('Free some device storage to download US products.');
      const file = fileFor(pack);
      try {
        // No network-type gate: cellular downloads are explicitly enabled.
        if (!file.exists) await File.downloadFileAsync(pack.url, file, { signal: AbortSignal.timeout(120000) });
        await serialized(queue, async () => {
          try { await verify(pack, file, true); }
          catch (error) {
            // Retry must replace corrupt downloads rather than repeatedly reuse
            // them. Readers finish before this content-addressed file is removed.
            const retained = [...installed, ...previous].some(old => old.sha256 === pack.sha256);
            // A descriptor mismatch must not destroy previously activated bytes.
            // Actual damaged bytes must be removed so retry can download afresh.
            if (!retained || error instanceof InvalidPackFile) {
              if (file.exists) file.delete();
              cachedReceipts.delete(pack.sha256);
              const receipt = receiptFor(pack); if (receipt.exists) receipt.delete();
            }
            throw error;
          }
        });
        const next = [...installed.filter(old => old.id !== pack.id), pack];
        const old = installed.find(old => old.id === pack.id && old.sha256 !== pack.sha256);
        const prior = old ? [...previous.filter(item => item.id !== pack.id), old] : previous;
        // Never save personal metadata while holding the catalog reader queue.
        await saveMetadata('foodPackIndex', { active: next, previous: prior }); installed = next; previous = prior;
      } catch (error) {
        await serialized(queue, async () => {
          if (![...installed, ...previous].some(old => old.sha256 === pack.sha256) && file.exists) { try { file.delete(); } catch { /* Retry can clean an incomplete download. */ } }
        });
        throw error;
      }
    }),
    retire: wanted => serialized(mutations, async () => {
      const next = installed.filter(old => wanted.some(pack => pack.id === old.id && pack.sha256 === old.sha256));
      const prior = previous.filter(old => next.some(pack => pack.id === old.id));
      await saveMetadata('foodPackIndex', { active: next, previous: prior }); installed = next; previous = prior;
      await serialized(queue, async () => {
        const keep = new Set([...installed, ...previous].map(pack => fileFor(pack).name));
        for (const hash of cachedReceipts.keys()) if (!keep.has(`pack-${hash}.sqlite`)) cachedReceipts.delete(hash);
        for (const entry of directory.list()) if (entry instanceof File && /^pack-[a-f0-9]{64}\.(sqlite|verified\.json)$/.test(entry.name) && !keep.has(entry.name.replace(/\.verified\.json$/, '.sqlite'))) {
          try { entry.delete(); } catch { /* A later successful update can retry cleanup. */ }
        }
      });
    }),
    withReader: (pack, work) => serialized(queue, async () => {
      const file = fileFor(pack);
      await verify(pack, file);
      const db = await open(file);
      try { return await work(createCatalogReader(read => read(db))); }
      finally { await db.closeAsync(); }
    }),
  };
}
