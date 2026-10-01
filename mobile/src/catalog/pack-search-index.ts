import type { Food } from '../../../lib/food';
import type { FoodSearchOptions, FoodSearchIssue } from '../../../lib/food-search';
import { analyzeFoodQuery, foodSearchTerms, inferredFoodBrand, rankFoodSearch } from '../../../lib/search';
import { transaction, type SqliteConnection } from '../local/database';
import type { FoodPack } from './packs';

export type PackSearchWindow = { foods: Food[]; canExpand: boolean; issues?: FoodSearchIssue[] };
export type IndexedPackSearch = (query: string, options?: FoodSearchOptions) => Promise<PackSearchWindow>;
type Document = { id: string; name: string; brand: string | null; branded: number; generation: number };
type Marker = { generation: number; pack_id: string; sha256: string; version: string; count: number };
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new Error('Operation cancelled.'); };
const matches = (marker: Marker, pack: FoodPack) => marker.pack_id === pack.id && marker.sha256 === pack.sha256 && marker.version === pack.version && marker.count === pack.count;

// Only searchable metadata is duplicated. Nutrients and portions always come
// from the immutable, verified source pack after candidate selection.
export function createPackSearchIndex(database: <T>(write: boolean, work: (db: SqliteConnection) => Promise<T>) => Promise<T>) {
  let failedSearch = false;
  const initialized = async <T>(write: boolean, work: (db: SqliteConnection) => Promise<T>) => database(write, async db => {
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (version?.user_version !== 2) {
      await db.execAsync(`
      DROP TABLE IF EXISTS pack_search_terms;
      DROP TABLE IF EXISTS search_documents;
      DROP TABLE IF EXISTS search_packs;
      CREATE TABLE search_documents(rowid INTEGER PRIMARY KEY,id TEXT NOT NULL,name TEXT NOT NULL,brand TEXT,branded INTEGER NOT NULL,generation INTEGER NOT NULL,terms_name TEXT NOT NULL,terms_brand TEXT NOT NULL,UNIQUE(generation,id));
      CREATE INDEX search_identity ON search_documents(id);
      CREATE TABLE search_packs(generation INTEGER PRIMARY KEY,pack_id TEXT NOT NULL,sha256 TEXT NOT NULL,version TEXT NOT NULL,count INTEGER NOT NULL,UNIQUE(pack_id,sha256));
      CREATE VIRTUAL TABLE pack_search_terms USING fts5(terms_name,terms_brand,content='search_documents',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
      PRAGMA user_version=2;
    `);
      failedSearch = false;
    }
    return work(db);
  });
  const remove = async (db: SqliteConnection, pack: Pick<FoodPack, 'id' | 'sha256'>) => {
    const marker = await db.getFirstAsync<{ generation: number }>('SELECT generation FROM search_packs WHERE pack_id=? AND sha256=?', pack.id, pack.sha256);
    if (!marker) return;
    await db.runAsync("INSERT INTO pack_search_terms(pack_search_terms,rowid,terms_name,terms_brand) SELECT 'delete',rowid,terms_name,terms_brand FROM search_documents WHERE generation=?", marker.generation);
    await db.runAsync('DELETE FROM search_documents WHERE generation=?', marker.generation);
    await db.runAsync('DELETE FROM search_packs WHERE pack_id=? AND sha256=?', pack.id, pack.sha256);
  };
  return {
    missing: (packs: FoodPack[]) => !packs.length ? Promise.resolve([]) : failedSearch
      ? Promise.reject(new Error('The downloaded food search index needs to be rebuilt.')) : initialized(false, async db => {
      const markers = await db.getAllAsync<Marker>('SELECT generation,pack_id,sha256,version,count FROM search_packs');
      return packs.filter(pack => !markers.some(marker => matches(marker, pack)));
    }),
    index: (pack: FoodPack, source: SqliteConnection) => initialized(true, db => transaction(db, async () => {
      await remove(db, pack);
      await db.runAsync('INSERT INTO search_packs(pack_id,sha256,version,count) VALUES(?,?,?,?)', pack.id, pack.sha256, pack.version, pack.count);
      const marker = await db.getFirstAsync<{ generation: number }>('SELECT generation FROM search_packs WHERE pack_id=? AND sha256=?', pack.id, pack.sha256);
      let last = '', count = 0;
      for (;;) {
        const rows = await source.getAllAsync<{ id: string; food: string }>('SELECT id,food FROM foods WHERE id>? ORDER BY id LIMIT 500', last);
        if (!rows.length) break;
        for (let offset = 0; offset < rows.length; offset += 50) {
          const page = rows.slice(offset, offset + 50), values = page.flatMap(row => {
            const food = JSON.parse(row.food) as Food;
            return [row.id, food.name, food.brand ?? null, Number(food.sourceDataset === 'usda-branded'), marker!.generation,
              foodSearchTerms(food.name).join(' '), foodSearchTerms(inferredFoodBrand(food) ?? '').join(' ')];
          });
          await db.runAsync(`INSERT INTO search_documents(id,name,brand,branded,generation,terms_name,terms_brand) VALUES ${page.map(() => '(?,?,?,?,?,?,?)').join(',')}`, ...values);
        }
        count += rows.length; last = rows[rows.length - 1].id;
      }
      if (count !== pack.count) throw new Error('The downloaded foods changed during search preparation.');
      await db.runAsync('INSERT INTO pack_search_terms(rowid,terms_name,terms_brand) SELECT rowid,terms_name,terms_brand FROM search_documents WHERE generation=?', marker!.generation);
    })),
    retire: (keep: FoodPack[]) => initialized(true, db => transaction(db, async () => {
      const markers = await db.getAllAsync<Marker>('SELECT generation,pack_id,sha256,version,count FROM search_packs');
      for (const marker of markers) if (!keep.some(pack => matches(marker, pack))) await remove(db, { id: marker.pack_id, sha256: marker.sha256 });
    })),
    async search(query: string, options: FoodSearchOptions, packs: FoodPack[], hydrate: (pack: FoodPack, ids: string[]) => Promise<Food[]>): Promise<PackSearchWindow> {
      cancelled(options.signal);
      const analyzed = analyzeFoodQuery(query);
      if (!packs.length || !analyzed.tokens.length || ['custom', 'restaurant', 'generic'].includes(options.category ?? '')) return { foods: [], canExpand: false };
      return initialized(false, async db => {
        cancelled(options.signal);
        const markers = await db.getAllAsync<Marker>('SELECT generation,pack_id,sha256,version,count FROM search_packs');
        // Until a source is fully prepared, an unindexed activated chunk may
        // contain a newer renamed identity. Do not expose its older copy.
        const pendingSources = new Set(packs.filter(pack => !markers.some(marker => matches(marker, pack))).map(pack => pack.source));
        const ready = packs.filter(pack => !pendingSources.has(pack.source));
        const generations = new Map(ready.map(pack => [markers.find(marker => matches(marker, pack))!.generation, pack]));
        const issues: FoodSearchIssue[] = ready.length === packs.length ? [] : [{ source: 'Downloaded foods', message: 'Downloaded products are being prepared for search. Check food catalog updates if preparation does not finish.' }];
        if (!ready.length) return { foods: [], canExpand: false, issues };
        // These temporary activation pointers are small. Staged/retired rows
        // never participate, even if a separate activation metadata commit failed.
        await db.execAsync('CREATE TEMP TABLE IF NOT EXISTS search_active(generation INTEGER PRIMARY KEY,priority INTEGER); DELETE FROM search_active;');
        for (let offset = 0; offset < ready.length; offset += 250) {
          const page = ready.slice(offset, offset + 250);
          await db.runAsync(`INSERT INTO search_active VALUES ${page.map(() => '(?,?)').join(',')}`, ...page.flatMap((pack, index) => [markers.find(marker => matches(marker, pack))!.generation, offset + index]));
        }
        const variants = [...new Set(analyzed.variants.map(variant => foodSearchTerms(variant).slice(0, 10).map(term => `"${term}"*`).join(' AND ')).filter(Boolean))];
        const brand = foodSearchTerms(options.brand ?? '').join(' ');
        const rows = await db.getAllAsync<Document>(`SELECT d.id,d.name,d.brand,d.branded,d.generation
          FROM pack_search_terms s JOIN search_documents d ON d.rowid=s.rowid
          JOIN search_active a ON a.generation=d.generation
          WHERE pack_search_terms MATCH ? ${brand ? 'AND d.terms_brand=?' : ''}
          AND NOT EXISTS(SELECT 1 FROM search_documents newer JOIN search_active fresh ON fresh.generation=newer.generation WHERE newer.id=d.id AND fresh.priority<a.priority)
          ORDER BY bm25(pack_search_terms),length(d.name),d.name,d.id LIMIT 1001`, variants.map(variant => `(${variant})`).join(' OR '), ...(brand ? [brand] : [])).catch(error => {
            // Readable pack markers do not prove the FTS pages are healthy.
            // Request repair during preparation, never rebuild during search.
            failedSearch = true; throw error;
          });
        cancelled(options.signal);
        const projection = (row: Document): Food => ({ id: row.id, name: row.name, ...(row.brand ? { brand: row.brand } : {}), source: generations.get(row.generation)!.source === 'off' ? 'Open Food Facts' : 'USDA FoodData Central',
          ...(row.branded ? { sourceDataset: 'usda-branded' as const } : {}), sourceKind: 'database',
          servingLabel: '', servingGrams: null, calories: 0, protein: 0, carbs: 0, fat: 0 });
        const ranked = rankFoodSearch(query, rows.map(projection), options).foods;
        const cap = Math.max(20, Math.min(1000, Math.floor(options.window ?? 100)));
        const locations = new Map(rows.map(row => [row.id, row]));
        const groups = new Map<FoodPack, string[]>();
        for (const food of ranked.slice(0, cap)) {
          const row = locations.get(food.id)!;
          const pack = generations.get(row.generation)!;
          const ids = groups.get(pack) ?? []; ids.push(food.id); groups.set(pack, ids);
        }
        const foods: Food[] = [];
        for (const [pack, ids] of groups) {
          cancelled(options.signal);
          try { for (let offset = 0; offset < ids.length; offset += 400) foods.push(...await hydrate(pack, ids.slice(offset, offset + 400))); }
          catch (error) {
            cancelled(options.signal);
            const source = pack.source === 'off' ? 'Open Food Facts' : 'USDA branded';
            if (!issues.some(issue => issue.source === source)) issues.push({ source, message: error instanceof Error ? error.message : 'Some downloaded foods are unavailable.' });
          }
        }
        cancelled(options.signal);
        return { foods: rankFoodSearch(query, foods, options).foods, canExpand: cap < 1000 && (rows.length > 1000 || ranked.length > cap), issues };
      });
    },
  };
}
export type PackSearchIndex = ReturnType<typeof createPackSearchIndex>;
