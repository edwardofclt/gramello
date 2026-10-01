import { inspectFoodPack, PackManifestChangedError, type FoodPack, type PackStorage } from '../../mobile/src/catalog/packs';
import type { UpdateState } from '../../mobile/src/catalog/updater';
import { createCatalogReader } from '../../mobile/src/catalog/queries';
import type { FoodCatalog } from '../../mobile/src/local/repository';
import type { SqliteConnection } from '../../mobile/src/local/database';
import { readPackManifestResponse, readPackResponse } from '../../mobile/src/catalog/downloads';
import { readPackIds, type PackRouteLookup } from '../../mobile/src/catalog/pack-routes';
import { createBrowserPackRoutes } from './pack-routes';
import { decodePackEntries, type PackEntry } from './pack-entries';
import type { BrowserPackFiles } from './pack-files';
import type { SnapshotStore } from './persistence';
import type { IndexedPackSearch, PackSearchIndex } from '../../mobile/src/catalog/pack-search-index';
import { foodSchema } from '../../mobile/src/local/records';
import { preferredFoodServing } from '../food-servings';
export const readPackDownload = readPackResponse;
const hash = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
type Connection = SqliteConnection & { close(): void };
export function createBrowserPackStorage(options: {
  store: SnapshotStore; open(bytes: Uint8Array<ArrayBuffer>): Connection;
  lock<T>(name: string, work: () => Promise<T>): Promise<T>;
  files?: BrowserPackFiles | (() => BrowserPackFiles | undefined); fetcher?: typeof fetch; manifestUrl: string;
  searchIndex?: PackSearchIndex & { reset?(): Promise<void> };
}): PackStorage & { routes: PackRouteLookup; search?: IndexedPackSearch; withReader<T>(pack: FoodPack, work: (reader: FoodCatalog) => Promise<T>): Promise<T> } {
  const { store, open, lock } = options, fetcher = options.fetcher ?? fetch;
  const searchIndex = options.searchIndex;
  let files: BrowserPackFiles | undefined;
  const refreshFiles = () => { files = typeof options.files === 'function' ? options.files() : options.files; };
  const routeIndex = createBrowserPackRoutes(store);
  const entries = async () => decodePackEntries(await store.read('packs:index'));
  const list = async () => (await entries()).map(entry => entry.pack);
  const current = async (pack: FoodPack) => {
    const entry = (await entries()).find(entry => entry.pack.id === pack.id && entry.pack.sha256 === pack.sha256 && entry.pack.version === pack.version);
    if (!entry) throw new Error('The installed food pack changed. Retry the lookup.');
    return entry;
  };
  const checkFile = async (entry: PackEntry) => {
    if (!files) throw new Error('Browser file storage is unavailable. Installed packs have not been removed.');
    const stamp = await files.stat(entry.pack);
    if (!stamp || stamp.bytes !== entry.pack.bytes) return false;
    // The durable activation entry follows download validation. Legacy entries
    // have no stamp; they remain readable without rehashing on first search.
    return !entry.stamp || entry.stamp.modifiedAt === null || stamp.modifiedAt === null
      || stamp.modifiedAt === entry.stamp.modifiedAt;
  };
  const readSnapshot = async (pack: FoodPack) => {
    const bytes = await store.read<Uint8Array<ArrayBuffer>>('packs:' + pack.id);
    if (!bytes || bytes.length !== pack.bytes) throw new Error('A downloaded food pack is unavailable or corrupt. Check for updates.');
    return bytes;
  };
  const routePages = async (db: Connection, pack: FoodPack) => {
    const pages: string[][] = [];
    if (pack.source === 'usda-branded') await readPackIds(db, async ids => { pages.push(ids); });
    return pages;
  };
  const inspect = async (db: Connection, pack: FoodPack) => {
    try {
      await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-2048;');
      await inspectFoodPack(db, pack);
      await searchIndex?.index(pack, db);
      return await routePages(db, pack);
    } finally { db.close(); }
  };
  const activate = async (entry: PackEntry, pages: string[][], bytes?: Uint8Array<ArrayBuffer>) => {
    const installed = await entries(), pack = entry.pack;
    const removed = installed.filter(old => old.pack.id === pack.id && old.pack.sha256 !== pack.sha256).map(old => old.pack);
    const routeChanges = await routeIndex.change({ pack, pages }, removed);
    await store.commit([['packs:' + pack.id, bytes], ['packs:stamp:' + pack.id, bytes ? Date.now() : undefined],
      ['packs:previous:' + pack.id, undefined], ['packs:index', [...installed.filter(old => old.pack.id !== pack.id), entry]], ...routeChanges]);
  };
  const activateFile = async (pack: FoodPack, temporary: string) => {
    await files!.activate(pack, temporary);
    if (await hash(await files!.read(pack)) !== pack.sha256) throw new Error('The food pack did not pass verification.');
    const pages = await inspect(await files!.open(pack), pack);
    const stamp = await files!.stat(pack);
    if (!stamp || stamp.bytes !== pack.bytes) throw new Error('The food pack changed during installation.');
    const entry: PackEntry = { format: 1, pack, location: 'opfs', stamp };
    await activate(entry, pages);
    return entry;
  };
  const openEntry = async (entry: PackEntry) => {
    if (entry.location === 'indexeddb') return open(await readSnapshot(entry.pack));
    if (!await checkFile(entry)) throw new Error('A downloaded food pack is unavailable or corrupt. Check for updates.');
    return files!.open(entry.pack);
  };
  return {
    list,
    async prepareSearch(onProgress) {
      if (!searchIndex) return;
      const packs = await list();
      if (!packs.length) return;
      let missing: FoodPack[];
      try { missing = await lock('gramello:food-packs', () => searchIndex.missing(packs)); }
      catch (error) {
        if (!searchIndex.reset) throw error;
        await lock('gramello:food-packs', () => searchIndex.reset!()); missing = packs;
      }
      let completed = packs.length - missing.length;
      if (missing.length) onProgress?.(completed, packs.length);
      for (const pack of missing) {
        try { await lock('gramello:food-packs', async () => {
          refreshFiles(); const db = await openEntry(await current(pack));
          try { await searchIndex.index(pack, db); } finally { db.close(); }
        }); } catch { /* The ensuing update repairs unavailable canonical files. */ }
        onProgress?.(++completed, packs.length);
      }
    },
    search: searchIndex ? (query, options = {}) => lock('gramello:food-packs', async () => {
      refreshFiles();
      const packs = (await list()).reverse().sort((a, b) => Number(a.source === 'off') - Number(b.source === 'off'));
      return searchIndex.search(query, options, packs, async (pack, ids) => {
        const db = await openEntry(await current(pack));
        try {
          const rows = await db.getAllAsync<{ food: string }>(`SELECT food FROM foods WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
          return rows.map(row => preferredFoodServing(foodSchema.parse(JSON.parse(row.food))));
        } finally { db.close(); }
      });
    }) : undefined,
    exclusive: work => lock('gramello:food-pack-update', work),
    recover: () => lock('gramello:food-packs', async () => {
      refreshFiles(); await files?.recover?.();
    }),
    available: pack => lock('gramello:food-packs', async () => {
      refreshFiles();
      const entry = await current(pack);
      const indexed = !searchIndex || !(await searchIndex.missing([pack])).length;
      if (entry.location === 'opfs') return indexed && await checkFile(entry);
      try { await readSnapshot(pack); return indexed; } catch { return false; }
    }),
    routes: (id, _installed) => lock('gramello:food-packs', async () => {
      refreshFiles();
      const installed = await list();
      for (const pack of installed) if (pack.source === 'usda-branded' && !await routeIndex.indexed(pack)) {
        const entry = await current(pack), db = await openEntry(entry);
        let pages: string[][];
        try { pages = await routePages(db, pack); } finally { db.close(); }
        await store.commit(await routeIndex.change({ pack, pages }));
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
        await searchIndex?.retire(kept.map(entry => entry.pack));
        if (files) await files.retire(kept.filter(entry => entry.location === 'opfs').map(entry => entry.pack));
      });
    },
    withReader: (pack, work) => lock('gramello:food-packs', async () => {
      refreshFiles();
      const entry = await current(pack), db = await openEntry(entry);
      try { await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-2048;'); return await work(createCatalogReader(read => read(db))); }
      finally { db.close(); }
    }),
  };
}
