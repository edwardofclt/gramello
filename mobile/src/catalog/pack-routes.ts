import type { SqliteConnection } from '../local/database';
import type { FoodPack } from './packs';
export type PackRouteResult = { packs: FoodPack[]; complete: boolean };
export type PackRouteLookup = (id: string, installed: FoodPack[]) => Promise<PackRouteResult>;
export async function readPackIds(db: SqliteConnection, page: (ids: string[]) => Promise<void>): Promise<void> {
  let last = '';
  for (;;) {
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM foods WHERE id>? ORDER BY id LIMIT 500', last);
    if (!rows.length) return;
    await page(rows.map(row => row.id)); last = rows[rows.length - 1].id;
  }
}
