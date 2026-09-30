import { inspectFoodPack, PackManifestChangedError, type FoodPack, type PackStorage } from '../../mobile/src/catalog/packs';
import type { UpdateState } from '../../mobile/src/catalog/updater';
import { createCatalogReader } from '../../mobile/src/catalog/queries';
import type { FoodCatalog } from '../../mobile/src/local/repository';
import type { SqliteConnection } from '../../mobile/src/local/database';
import { readPackManifestResponse, readPackResponse } from '../../mobile/src/catalog/downloads';
import { readPackIds, type PackRouteLookup } from '../../mobile/src/catalog/pack-routes';
import { createPackVerification } from '../../mobile/src/catalog/pack-verification';
import { createBrowserPackRoutes } from './pack-routes';
import { decodePackEntries, type PackEntry } from './pack-entries';
import type { BrowserPackFiles } from './pack-files';
import type { SnapshotStore } from './persistence';
export const readPackDownload = readPackResponse;
const hash = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
type Connection = SqliteConnection & { close(): void };
export function createBrowserPackStorage(options: {
  store: SnapshotStore; open(bytes: Uint8Array<ArrayBuffer>): Connection;
  lock<T>(name: string, work: () => Promise<T>): Promise<T>;
  files?: BrowserPackFiles | (() => BrowserPackFiles | undefined); fetcher?: typeof fetch; manifestUrl: string;
}): PackStorage & { routes: PackRouteLookup; withReader<T>(pack: FoodPack, work: (reader: FoodCatalog) => Promise<T>): Promise<T> } {
  const { store, open, lock } = options, fetcher = options.fetcher ?? fetch;
  let files: BrowserPackFiles | undefined;
  const refreshFiles = () => { files = typeof options.files === 'function' ? options.files() : options.files; };
  const routeIndex = createBrowserPackRoutes(store), verification = createPackVerification();
  const entries = async () => decodePackEntries(await store.read('packs:index'));
  const list = async () => (await entries()).map(entry => entry.pack);
  const current = async (pack: FoodPack) => {
    const entry = (await entries()).find(entry => entry.pack.id === pack.id && entry.pack.sha256 === pack.sha256 && entry.pack.version === pack.version);
    if (!entry) throw new Error('The installed food pack changed. Retry the lookup.');
    return entry;
  };
  const verifyFile = async (pack: FoodPack, force = false) => {
    if (!files) throw new Error('Browser file storage is unavailable. Installed packs have not been removed.');
    const stamp = await files.stat(pack);
    if (!stamp) { verification.invalidate(pack.sha256); return false; }
    const backend = files;
    return verification.verify(pack, stamp, async () => hash(await backend.read(pack)), force);
  };
  const readSnapshot = async (pack: FoodPack, force = false) => {
    const bytes = await store.read<Uint8Array<ArrayBuffer>>('packs:' + pack.id);
    const stamp = await store.read<number>('packs:stamp:' + pack.id);
    if (!bytes || !await verification.verify(pack, { bytes: bytes.length, modifiedAt: stamp ?? null }, () => hash(bytes), force)) {
      verification.invalidate(pack.sha256); throw new Error('A downloaded food pack is unavailable or corrupt. Check for updates.');
    }
    return bytes;
  };
  const inspect = async (db: Connection, pack: FoodPack) => {
    try {
      await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-2048;');
      await inspectFoodPack(db, pack);
      const pages: string[][] = [];
      if (pack.source === 'usda-branded') await readPackIds(db, async ids => { pages.push(ids); });
      return pages;
    } finally { db.close(); }
  };
  const activate = async (entry: PackEntry, pages: string[][], bytes?: Uint8Array<ArrayBuffer>) => {
    const installed = await entries(), pack = entry.pack;
    const removed = installed.filter(old => old.pack.id === pack.id && old.pack.sha256 !== pack.sha256).map(old => old.pack);
    const routeChanges = await routeIndex.change({ pack, pages }, removed);
    await store.commit([['packs:' + pack.id, bytes], ['packs:stamp:' + pack.id, bytes ? Date.now() : undefined],
      ['packs:previous:' + pack.id, undefined], ['packs:index', [...installed.filter(old => old.pack.id !== pack.id), entry]], ...routeChanges]);
    verification.invalidate(pack.sha256);
    for (const old of removed) verification.invalidate(old.sha256);
  };
  const activateFile = async (pack: FoodPack, temporary: string) => {
    await files!.activate(pack, temporary);
    verification.invalidate(pack.sha256);
    if (!await verifyFile(pack, true)) throw new Error('The food pack did not pass verification.');
    const pages = await inspect(await files!.open(pack), pack);
    const entry: PackEntry = { format: 1, pack, location: 'opfs' };
    await activate(entry, pages);
    return entry;
  };
  const migrate = async (entry: PackEntry): Promise<PackEntry> => {
    if (entry.location !== 'indexeddb' || !files || files.direct === false) return entry;
    let temporary: string | undefined;
    try {
      const bytes = await readSnapshot(entry.pack, true);
      temporary = await files.stage(entry.pack, new Response(bytes));
      return await activateFile(entry.pack, temporary);
    } catch { return entry; /* Failed migration never removes legacy activation or bytes. */ }
    finally { if (temporary) await files.removeTemporary(temporary).catch(() => {}); }
  };
  const openEntry = async (entry: PackEntry) => {
    if (entry.location === 'indexeddb') return open(await readSnapshot(entry.pack));
    if (!await verifyFile(entry.pack)) throw new Error('A downloaded food pack is unavailable or corrupt. Check for updates.');
    return files!.open(entry.pack);
  };
  return {
    list,
    exclusive: work => lock('gramello:food-pack-update', work),
    recover: () => lock('gramello:food-packs', async () => {
      refreshFiles(); await files?.recover?.();
    }),
    available: pack => lock('gramello:food-packs', async () => {
      refreshFiles();
      const entry = await current(pack);
      if (entry.location === 'opfs') return verifyFile(pack, true);
      try { await readSnapshot(pack, true); return true; } catch { return false; }
    }),
    routes: (id, _installed) => lock('gramello:food-packs', async () => {
      refreshFiles();
      const installed = await list();
      for (const pack of installed) if (pack.source === 'usda-branded' && !await routeIndex.indexed(pack)) {
        const entry = await migrate(await current(pack));
        if (!await routeIndex.indexed(pack)) {
          const pages = await inspect(await openEntry(entry), pack);
          await store.commit(await routeIndex.change({ pack, pages }));
        }
      }
      return routeIndex.lookup(id, installed);
    }),
    load: async () => await store.read<UpdateState>('packs:update') ?? {},
    save: state => store.commit([['packs:update', state]]),
    async fetchManifest() {
      const response = await fetcher(options.manifestUrl, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('US product downloads are unavailable. Installed foods remain usable.');
      return readPackManifestResponse(response);
    },
    async install(pack, onProgress) {
      refreshFiles();
      const response = await fetcher(`/api/catalog/packs/download?${new URLSearchParams({ id: pack.id, sha256: pack.sha256 })}`, { signal: AbortSignal.timeout(120000) });
      if (response.status === 409) { await response.body?.cancel(); throw new PackManifestChangedError(); }
      if (files && files.direct !== false) {
        const temporary = await files.stage(pack, response, onProgress);
        try { await lock('gramello:food-packs', () => activateFile(pack, temporary)); }
        finally { await files.removeTemporary(temporary).catch(() => {}); }
      } else {
        const bytes = await readPackResponse(response, pack.bytes, onProgress);
        if (await hash(bytes) !== pack.sha256) throw new Error('The food pack did not pass verification.');
        await lock('gramello:food-packs', async () => {
          const pages = await inspect(open(bytes), pack);
          await activate({ format: 1, pack, location: 'indexeddb' }, pages, bytes);
        });
      }
    },
    async retire(wanted) {
      await lock('gramello:food-packs', async () => {
        refreshFiles();
        const installed = await entries(), kept = installed.filter(old => wanted.some(next => next.id === old.pack.id && next.sha256 === old.pack.sha256));
        const removed = installed.filter(old => !kept.includes(old)).map(entry => entry.pack);
        await store.commit([['packs:index', kept], ...removed.flatMap(pack => [['packs:' + pack.id, undefined], ['packs:stamp:' + pack.id, undefined], ['packs:previous:' + pack.id, undefined]] as Array<readonly [string, unknown]>), ...await routeIndex.change(undefined, removed)]);
        for (const pack of removed) verification.invalidate(pack.sha256);
        if (files) await files.retire(kept.filter(entry => entry.location === 'opfs').map(entry => entry.pack));
      });
    },
    withReader: (pack, work) => lock('gramello:food-packs', async () => {
      refreshFiles();
      const entry = await migrate(await current(pack)), db = await openEntry(entry);
      try { await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-2048;'); return await work(createCatalogReader(read => read(db))); }
      finally { db.close(); }
    }),
  };
}
