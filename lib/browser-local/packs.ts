import { packSchema, inspectFoodPack, PackManifestChangedError, type FoodPack, type PackStorage } from '../../mobile/src/catalog/packs';
import type { UpdateState } from '../../mobile/src/catalog/updater';
import { createCatalogReader } from '../../mobile/src/catalog/queries';
import type { FoodCatalog } from '../../mobile/src/local/repository';
import type { SqliteConnection } from '../../mobile/src/local/database';
import type { SnapshotStore } from './persistence';
import { readPackManifestResponse, readPackResponse } from '../../mobile/src/catalog/downloads';
import { readPackIds, type PackRouteLookup } from '../../mobile/src/catalog/pack-routes';
import { createBrowserPackRoutes } from './pack-routes';

export const readPackDownload = readPackResponse;
const hash = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
export function createBrowserPackStorage(options: {
  store: SnapshotStore;
  open(bytes: Uint8Array<ArrayBuffer>): SqliteConnection & { close(): void };
  lock<T>(name: string, work: () => Promise<T>): Promise<T>;
  fetcher?: typeof fetch;
  manifestUrl: string;
}): PackStorage & { routes: PackRouteLookup; withReader<T>(pack: FoodPack, work: (reader: FoodCatalog) => Promise<T>): Promise<T> } {
  const { store, open, lock } = options, fetcher = options.fetcher ?? fetch;
  const routeIndex = createBrowserPackRoutes(store);
  const list = async () => (await store.read<unknown[]>('packs:index') ?? []).flatMap(value => {
    const parsed = packSchema.safeParse(value); return parsed.success ? [parsed.data] : [];
  });
  return {
    list,
    routes: (id, _installed) => lock('gramello:food-packs', async () => {
      const current = await list();
      for (const pack of current) if (pack.source === 'usda-branded' && !await routeIndex.indexed(pack)) {
        const bytes = await store.read<Uint8Array<ArrayBuffer>>('packs:' + pack.id);
        if (!bytes || bytes.length !== pack.bytes || await hash(bytes) !== pack.sha256) throw new Error('A downloaded food pack is unavailable or corrupt.');
        const pages: string[][] = [], db = open(bytes);
        try { await inspectFoodPack(db, pack); await readPackIds(db, async ids => { pages.push(ids); }); } finally { db.close(); }
        await store.commit(await routeIndex.change({ pack, pages }));
      }
      return routeIndex.lookup(id, current);
    }),
    // A whole update owns a separate cross-tab lease. Per-pack reader locks
    // remain short so searches can use completed packs during downloads.
    exclusive: work => lock('gramello:food-pack-update', work),
    async available(pack) {
      const bytes = await store.read<Uint8Array<ArrayBuffer>>('packs:' + pack.id);
      return !!bytes && bytes.length === pack.bytes && await hash(bytes) === pack.sha256;
    },
    load: async () => await store.read<UpdateState>('packs:update') ?? {},
    save: state => store.commit([['packs:update', state]]),
    async fetchManifest() {
      const response = await fetcher(options.manifestUrl, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('US product downloads are unavailable. Installed foods remain usable.');
      return readPackManifestResponse(response);
    },
    async install(pack) {
      const response = await fetcher(`/api/catalog/packs/download?${new URLSearchParams({ id: pack.id, sha256: pack.sha256 })}`, { signal: AbortSignal.timeout(120000) });
      if (response.status === 409) { await response.body?.cancel(); throw new PackManifestChangedError(); }
      const bytes = await readPackDownload(response, pack.bytes);
      if (await hash(bytes) !== pack.sha256) throw new Error('The food pack did not pass verification.');
      await lock('gramello:food-packs', async () => {
        const db = open(bytes);
        try {
          await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
          await inspectFoodPack(db, pack);
          const pages: string[][] = [];
          if (pack.source === 'usda-branded') await readPackIds(db, async ids => { pages.push(ids); });
          const installed = await list(), previous = await store.read<Uint8Array>('packs:' + pack.id);
          const routeChanges = await routeIndex.change({ pack, pages }, installed.filter(old => old.id === pack.id && old.sha256 !== pack.sha256));
          await store.commit([['packs:' + pack.id, bytes], ['packs:previous:' + pack.id, previous],
            ['packs:index', [...installed.filter(old => old.id !== pack.id), pack]], ...routeChanges]);
        } finally { db.close(); }
      });
    },
    async retire(wanted) {
      await lock('gramello:food-packs', async () => {
        const installed = await list(), kept = installed.filter(old => wanted.some(next => next.id === old.id && next.sha256 === old.sha256));
        const removed = installed.filter(old => !kept.includes(old));
        await store.commit([['packs:index', kept], ...removed.flatMap(pack => [['packs:' + pack.id, undefined], ['packs:previous:' + pack.id, undefined]] as Array<readonly [string, unknown]>), ...await routeIndex.change(undefined, removed)]);
      });
    },
    withReader: (pack, work) => lock('gramello:food-packs', async () => {
      const bytes = await store.read<Uint8Array<ArrayBuffer>>('packs:' + pack.id);
      if (!bytes || bytes.length !== pack.bytes || await hash(bytes) !== pack.sha256) throw new Error('A downloaded food pack is unavailable or corrupt. Check for updates.');
      const db = open(bytes);
      try { await db.execAsync('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;'); return await work(createCatalogReader(read => read(db))); }
      finally { db.close(); }
    }),
  };
}
