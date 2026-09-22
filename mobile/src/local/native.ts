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
import { createCatalogUpdater, type UpdateState } from '../catalog/updater';
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
    const db = await SQLite.openDatabaseAsync(file.name,{ useNewConnection:true },directory.uri);
    try { await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;'); return db; }
    catch (error) { await db.closeAsync(); throw error; }
  };
  let active: SQLite.SQLiteDatabase | null = null;
  let activeVersion = '', activeName = '';
  const installed = await metadata<string>('catalogFile');
  if (installed && /^[a-zA-Z0-9._-]+\.sqlite$/.test(installed) && !installed.includes('..')) {
    const file = new File(directory,installed);
    if (file.exists) {
      try { active = await openCatalog(file); activeVersion = (await inspectCatalog(active)).version; activeName = installed; }
      catch { await active?.closeAsync().catch(() => {}); active = null; }
    }
  }
  // Keep the current app's bundled foods available even when a previously
  // installed catalog (or older release) covers fewer restaurants/products.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const asset = await Asset.fromModule(require('../../assets/catalog.sqlite')).downloadAsync();
  const seed = new File(directory,'starter.sqlite');
  if (seed.exists) seed.delete();
  await new File(asset.localUri ?? asset.uri).copy(seed);
  const bundled = await openCatalog(seed), bundledInfo = await inspectCatalog(bundled);
  if (!active) { active = bundled; activeVersion = bundledInfo.version; activeName = seed.name; }
  // The catalog queue keeps an old connection alive until its readers finish.
  const catalogLock = {} as SqliteConnection;
  const bundledReader = createCatalogReader(work => work(bundled));
  const downloaded = createCatalogReader(work => serialized(catalogLock, () => work(active!)), bundledReader);
  const foodCache = await SQLite.openDatabaseAsync('gramello-food-cache.sqlite');
  const catalog = await createFoodLookup(downloaded, foodCache);
  const repository = await createLocalRepository(personal, catalog, Crypto.randomUUID);
  const updater = createCatalogUpdater({
    async load() {
      const state = await metadata<UpdateState>('catalogUpdate') ?? {};
      return state.version === activeVersion ? state : { version:activeVersion };
    },
    async save(state) { await saveMetadata('catalogUpdate',state); },
    async fetchManifest() {
      const response = await fetch(catalogConfig.manifestUrl,{ signal:AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Catalog updates are temporarily unavailable. Your installed foods are ready to use.');
      const text = await response.text();
      if (text.length > 32768) throw new Error('Catalog manifest is too large.');
      return JSON.parse(text);
    },
    async install(manifest) {
      if (Paths.availableDiskSpace < manifest.bytes * 2 + 10 * 1024 * 1024) throw new Error('Free some device storage to update the food catalog.');
      const file = new File(directory,`catalog-${manifest.sha256}.sqlite`);
      let candidate: SQLite.SQLiteDatabase | null = null;
      try {
        if (!file.exists) await File.downloadFileAsync(manifest.url,file,{ signal:AbortSignal.timeout(120000) });
        if (file.size !== manifest.bytes) throw new Error('The catalog download is incomplete.');
        const hash = Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new Uint8Array(await file.bytes()))), b => b.toString(16).padStart(2,'0')).join('');
        if (hash !== manifest.sha256) throw new Error('The catalog download did not pass verification.');
        candidate = await openCatalog(file);
        await inspectCatalog(candidate,manifest);
        // Never acquire the personal queue while holding the catalog queue:
        // a diary operation may already own personal while searching catalog.
        await saveMetadata('catalogFile',file.name);
        await serialized(catalogLock, async () => {
          const previous = active!, previousName = activeName;
          active = candidate; candidate = null; activeVersion = manifest.version; activeName = file.name;
          if (previous !== bundled) await previous.closeAsync().catch(() => {});
          // Keep one previous complete catalog; remove older downloads on next install.
          for (const entry of directory.list()) if (entry instanceof File && entry.name !== activeName && entry.name !== previousName && entry.name !== 'starter.sqlite') {
            try { entry.delete(); } catch { /* Cached files can be cleaned later. */ }
          }
        });
      } finally {
        await candidate?.closeAsync().catch(() => {});
        if (file.name !== activeName && file.exists) { try { file.delete(); } catch { /* OS may reclaim this cache. */ } }
      }
    },
  },catalogConfig.publicKey);
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
