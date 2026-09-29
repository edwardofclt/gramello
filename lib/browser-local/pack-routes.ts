import type { FoodPack } from '../../mobile/src/catalog/packs';
import type { SnapshotStore } from './persistence';
type Route = { id: string; sha256: string };
const marker = (pack: FoodPack) => `packs:usda-index:${pack.id}:${pack.sha256}`;
const pageKey = (pack: FoodPack, page: number) => `${marker(pack)}:${page}`;
const routeKey = (id: string) => `packs:usda-route:${id}`;
export function createBrowserPackRoutes(store: SnapshotStore) {
  return {
    indexed: async (pack: FoodPack) => (await store.read<number>(marker(pack))) !== undefined,
    async change(added: { pack: FoodPack; pages: string[][] } | undefined, removed: FoodPack[] = []) {
      const changes = new Map<string, unknown>();
      const read = async (id: string) => changes.has(routeKey(id)) ? changes.get(routeKey(id)) as Route[] : await store.read<Route[]>(routeKey(id)) ?? [];
      for (const pack of removed.filter(pack => pack.source === 'usda-branded')) {
        const pages = await store.read<number>(marker(pack)) ?? 0;
        for (let page = 0; page < pages; page++) {
          for (const id of await store.read<string[]>(pageKey(pack, page)) ?? []) {
            changes.set(routeKey(id), (await read(id)).filter(route => route.id !== pack.id || route.sha256 !== pack.sha256));
          }
          changes.set(pageKey(pack, page), undefined);
        }
        changes.set(marker(pack), undefined);
      }
      if (added?.pack.source === 'usda-branded') {
        const { pack, pages } = added;
        for (let page = 0; page < pages.length; page++) {
          for (const id of pages[page]) {
            const routes = await read(id);
            if (!routes.some(route => route.id === pack.id && route.sha256 === pack.sha256)) routes.push({ id: pack.id, sha256: pack.sha256 });
            changes.set(routeKey(id), routes);
          }
          changes.set(pageKey(pack, page), pages[page]);
        }
        changes.set(marker(pack), pages.length);
      }
      return [...changes.entries()] as Array<readonly [string, unknown]>;
    },
    async lookup(id: string, installed: FoodPack[]) {
      const routes = await store.read<Route[]>(routeKey(id)) ?? [];
      const indexed = await Promise.all(installed.filter(pack => pack.source === 'usda-branded').map(pack => store.read<number>(marker(pack))));
      return { packs: installed.filter(pack => routes.some(route => route.id === pack.id && route.sha256 === pack.sha256)), complete: indexed.every(value => value !== undefined) };
    },
  };
}
