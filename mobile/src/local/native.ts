import * as SQLite from 'expo-sqlite';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import catalogConfig from '../../catalog-config.json';
import { createLocalRepository } from './repository';
import { createLocalApi } from './api';
import { withAnalytics } from '../analytics/api';
import { serialized, type SqliteConnection } from './database';
import { archiveCsv, MAX_ARCHIVE_BYTES, parseArchive } from './records';
import { createCatalogUpdater, combineCatalogUpdaters, type UpdateState } from '../catalog/updater';
import { createNativePackStorage } from '../catalog/native-packs';
import { createPackUpdater } from '../catalog/packs';
import { createPackCatalog } from '../catalog/pack-reader';
import { createCatalogReader, inspectCatalog } from '../catalog/queries';
import { createFoodLookup } from '../catalog/lookup';

async function openRuntime() {
  const personal = await SQLite.openDatabaseAsync('gramello-personal.sqlite');
  await personal.execAsync('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const metadata = async <T>(key: string): Promise<T | null> => serialized(personal, async () => {
    const row = await personal.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key=?',key);
    try { return row ? JSON.parse(row.value) as T : null; } catch { return null; }
  });
  const saveMetadata = (key: string, value: unknown) => serialized(personal, () => personal.runAsync('INSERT INTO app_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value)));
  const directory = new Directory(Paths.cache,'gramello-catalogs');
  directory.create({ intermediates:true,idempotent:true });
  const openCatalog = async (file: File) => {
    // FTS5 owns internal statements that Expo's close-time sweep would finalize
    // twice. Our query helpers already finalize their own statements.
    // https://github.com/expo/expo/issues/38168
    const db = await SQLite.openDatabaseAsync(file.name,{
      useNewConnection:true, finalizeUnusedStatementsBeforeClosing:false,
    },directory.uri);
    try { await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;'); return db; }
    catch (error) { await db.closeAsync(); throw error; }
  };
  let active: SQLite.SQLiteDatabase | null = null;
  let bundled: SQLite.SQLiteDatabase | null = null;
  let activeVersion = '', activeName = '', bundledName = '';
  const installed = await metadata<string>('catalogFile');
  const installedName = installed && /^[a-zA-Z0-9._-]+\.sqlite$/.test(installed) && !installed.includes('..') ? installed : null;
  // Catalog files are immutable after activation. Receipts live beside them,
  // avoiding the personal queue: logging food may already hold that queue.
  const receiptFor = (file: File) => new File(directory, `${file.name}.verified.json`);
  const fingerprint = (file: File) => {
    const info = file.info();
    return Number.isFinite(info.modificationTime) ? { bytes:file.size, modified:info.modificationTime } : null;
  };
  const inspectFile = async (db: SQLite.SQLiteDatabase, file: File, identity: string | null, expected?: { version: string; count: number }, force = false) => {
    const stamp = fingerprint(file), receipt = receiptFor(file);
    if (!force && identity && stamp && receipt.exists && receipt.size <= 1024) {
      try {
        const saved = JSON.parse(await receipt.text());
        if (saved.validation === 1 && saved.identity === identity && saved.bytes === stamp.bytes && saved.modified === stamp.modified) {
          // Probe only metadata, never counts, quick_check, or food rows.
          const schema = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
          const info = await db.getFirstAsync<{ value: string }>("SELECT value FROM catalog_meta WHERE key='version'");
          if (schema?.user_version === 1 && info && info.value === saved.version && (!expected || expected.version === info.value)) return { version:info.value };
        }
      } catch { /* Missing/stale receipts require full verification. */ }
    }
    const sha = /^catalog-([a-f0-9]{64})\.sqlite$/.exec(file.name)?.[1];
    if (sha && !force) {
      const hash = Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new Uint8Array(await file.bytes()))), b => b.toString(16).padStart(2,'0')).join('');
      if (hash !== sha) throw new Error('The installed food catalog did not pass verification.');
    }
    const info = await inspectCatalog(db, expected);
    if (JSON.stringify(stamp) !== JSON.stringify(fingerprint(file))) throw new Error('The food catalog changed during verification.');
    if (identity && stamp) {
      try { receipt.write(JSON.stringify({ validation:1, identity, ...stamp, version:info.version })); }
      catch { /* A read-only/full cache must not prevent using verified foods. */ }
    }
    return info;
  };
  // This queue also protects lazy opening from a concurrent catalog activation.
  const catalogLock = {} as SqliteConnection;
  // Fallback queries can run inside the primary reader's callback. A distinct
  // queue avoids reacquiring catalogLock; the only nested order is core -> bundle.
  const bundledLock = {} as SqliteConnection;
  const openBundled = async () => {
    if (bundled) return bundled;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asset = Asset.fromModule(require('../../assets/catalog.sqlite'));
    const identity = asset.hash && /^[a-f0-9]+$/i.test(asset.hash) ? asset.hash : null;
    const seed = new File(directory, identity ? `starter-${identity}.sqlite` : 'starter.sqlite');
    let candidate: SQLite.SQLiteDatabase | null = null;
    try {
      // A content-specific name reuses this release's copy across launches.
      // Assets without a stable hash are recopied, but only on first lookup.
      if (!seed.exists || !identity) {
        const downloaded = await asset.downloadAsync();
        if (seed.exists) seed.delete();
        await new File(downloaded.localUri ?? downloaded.uri).copy(seed);
      }
      candidate = await openCatalog(seed);
      await inspectFile(candidate, seed, identity);
      bundled = candidate; bundledName = seed.name;
      // Only create a new copy when this release's foods are first needed, then
      // retire prior bundle generations and their receipts under bundledLock.
      for (const entry of directory.list()) if (entry instanceof File && /^starter(?:-[a-f0-9]+)?\.sqlite(?:\.verified\.json)?$/i.test(entry.name)) {
        const name = entry.name.replace(/\.verified\.json$/, '');
        if (name !== bundledName && name !== activeName && name !== installedName) {
          try { entry.delete(); } catch { /* A later lookup can retry cache cleanup. */ }
        }
      }
      return bundled;
    } catch (error) {
      await candidate?.closeAsync().catch(() => {});
      try { if (seed.exists) seed.delete(); } catch { /* Retry on the next lookup. */ }
      throw error;
    }
  };
  const openActive = async () => {
    if (active) return active;
    if (installedName) {
      const file = new File(directory, installedName);
      if (file.exists) {
        let candidate: SQLite.SQLiteDatabase | null = null;
        try {
          candidate = await openCatalog(file);
          activeVersion = (await inspectFile(candidate, file, installedName)).version;
          active = candidate; activeName = installedName;
          return active;
        } catch { await candidate?.closeAsync().catch(() => {}); }
      }
    }
    active = await serialized(bundledLock, openBundled); activeName = bundledName;
    const info = await active.getFirstAsync<{ value: string }>("SELECT value FROM catalog_meta WHERE key='version'");
    activeVersion = info!.value;
    return active;
  };
  // Construct readers now; opening or validating a catalog is a food operation,
  // never a prerequisite for rendering saved diary snapshots and water.
  const bundledReader = createCatalogReader(work => serialized(bundledLock, async () => work(await openBundled())));
  const downloaded = createCatalogReader(work => serialized(catalogLock, async () => work(await openActive())), bundledReader);
  const foodCache = await SQLite.openDatabaseAsync('gramello-food-cache.sqlite');
  const packStorage = await createNativePackStorage(metadata, saveMetadata, catalogConfig.packManifestUrl);
  const catalog = await createFoodLookup(createPackCatalog(packStorage.list, packStorage.withReader, downloaded, packStorage.routes), foodCache);
  const repository = await createLocalRepository(personal, catalog, Crypto.randomUUID);
  const coreUpdater = createCatalogUpdater({
    async load() {
      const state = await metadata<UpdateState>('catalogUpdate') ?? {};
      if (activeVersion) return state.version === activeVersion ? state : { version:activeVersion };
      // Read activation metadata without opening/scanning the catalog.
      if (installedName) {
        const file = new File(directory, installedName);
        if (file.exists) {
          const receipt = receiptFor(file), stamp = fingerprint(file);
          // Legacy activations have no receipt yet. Known changed bytes should
          // request repair even when the remote catalog version is unchanged.
          if (receipt.exists && stamp) {
            try {
              const saved = receipt.size <= 1024 ? JSON.parse(await receipt.text()) : null;
              if (!saved || saved.validation !== 1 || saved.identity !== installedName || saved.bytes !== stamp.bytes || saved.modified !== stamp.modified) return { ...state, version:undefined };
            } catch { return { ...state, version:undefined }; }
          }
          return state;
        }
      }
      // Keep retry scheduling even when no catalog has been opened yet.
      return { ...state, version:undefined };
    },
    async save(state) { await saveMetadata('catalogUpdate',state); },
    async fetchManifest() {
      const response = await fetch(catalogConfig.manifestUrl,{ signal:AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Catalog updates are temporarily unavailable. Your installed foods are ready to use.');
      const text = await response.text();
      if (text.length > 32768) throw new Error('Catalog manifest is too large.');
      return JSON.parse(text);
    },
    async install(manifest, onProgress) {
      if (Paths.availableDiskSpace < manifest.bytes * 2 + 10 * 1024 * 1024) throw new Error('Free some device storage to update the food catalog.');
      const file = new File(directory,`catalog-${manifest.sha256}.sqlite`);
      let candidate: SQLite.SQLiteDatabase | null = null;
      let verifiedBytes = false;
      try {
        if (!file.exists) await File.downloadFileAsync(manifest.url,file,{ signal:AbortSignal.timeout(120000), onProgress: progress => onProgress?.(progress.bytesWritten) });
        if (file.size !== manifest.bytes) throw new Error('The catalog download is incomplete.');
        const hash = Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new Uint8Array(await file.bytes()))), b => b.toString(16).padStart(2,'0')).join('');
        if (hash !== manifest.sha256) throw new Error('The catalog download did not pass verification.');
        verifiedBytes = true;
        candidate = await openCatalog(file);
        await inspectFile(candidate,file,file.name,manifest,true);
        // Never acquire the personal queue while holding the catalog queue:
        // a diary operation may already own personal while searching catalog.
        await saveMetadata('catalogFile',file.name);
        await serialized(catalogLock, async () => {
          const previous = active, previousName = activeName || installedName;
          active = candidate; candidate = null; activeVersion = manifest.version; activeName = file.name;
          if (previous && previous !== bundled) await previous.closeAsync().catch(() => {});
          // Keep one previous complete catalog; remove older downloads on next install.
          for (const entry of directory.list()) if (entry instanceof File && /^catalog-[a-f0-9]{64}\.sqlite(?:\.verified\.json)?$/.test(entry.name)
            && entry.name.replace(/\.verified\.json$/, '') !== activeName && entry.name.replace(/\.verified\.json$/, '') !== previousName) {
            try { entry.delete(); } catch { /* Cached files can be cleaned later. */ }
          }
        });
      } finally {
        await candidate?.closeAsync().catch(() => {});
        // Cold startup leaves active unopened. A descriptor/metadata failure
        // must still preserve the previously activated, hash-valid file.
        if (file.name !== activeName && !(file.name === installedName && verifiedBytes) && file.exists) {
          try { file.delete(); const receipt = receiptFor(file); if (receipt.exists) receipt.delete(); }
          catch { /* OS may reclaim this cache. */ }
        }
      }
    },
  },catalogConfig.publicKey);
  const updater = combineCatalogUpdaters(coreUpdater, createPackUpdater(packStorage, catalogConfig.publicKey));
  return {
    repository, updater, api:withAnalytics(createLocalApi(repository)),
    async exportFile(format: 'backup' | 'diary' | 'water') {
      const archive = await repository.exportArchive();
      const text = format === 'backup' ? JSON.stringify(archive) : archiveCsv(archive)[format];
      const file = new File(Paths.cache,`gramello-${format}-${new Date().toISOString().replace(/[:.]/g,'-')}.${format === 'backup' ? 'gramello' : 'csv'}`);
      file.write(text);
      if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
      await Sharing.shareAsync(file.uri,{ mimeType:format === 'backup' ? 'application/json' : 'text/csv', UTI:format === 'backup' ? 'public.json' : 'public.comma-separated-values-text', dialogTitle:'Save your Gramello export' });
      // Android may resolve after launching the target app, before it reads the
      // file. Leave this export in the OS-managed cache instead of deleting it.
    },
    async pickImport() {
      const result = await DocumentPicker.getDocumentAsync({ type:'*/*',copyToCacheDirectory:true,multiple:false });
      if (result.canceled) return null;
      const file = new File(result.assets[0].uri);
      try {
        if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Backup exceeds the 32 MB import limit.');
        const text = await file.text(); return { text,archive:parseArchive(text) };
      } finally { if (file.exists) file.delete(); }
    },
  };
}
let runtime: ReturnType<typeof openRuntime> | undefined;
export function getLocalRuntime() {
  runtime ??= openRuntime().catch(error => { runtime = undefined; throw error; });
  return runtime;
}
