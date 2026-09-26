import { test as base, expect, type Page } from '@playwright/test';
import type { Food } from '../../lib/food';
import type { Archive, PersonalRecord } from '../../mobile/src/local/records';

// Every context owns a fresh browser diary. Only public provider traffic is
// stubbed; persistence and repository calls run through the production worker.
export const test = base;
export { expect };
test.beforeEach(async ({ context }) => {
  await context.route('https://world.openfoodfacts.org/**', route => route.abort());
});

export async function openDiary(page: Page) {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByText('Loading your diary…')).toBeHidden();
}

export async function localDiary<T>(page: Page, method: string, args: unknown[] = []): Promise<T> {
  return page.evaluate(({ method, args }) => new Promise<T>((resolve, reject) => {
    const worker = new Worker('/offline/diary-worker.js', { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error(`Local diary ${method} timed out.`)); }, 30_000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onerror = event => { finish(); reject(new Error(event.message)); };
    worker.onmessage = (event: MessageEvent<{ id?: number; value?: T; error?: string }>) => {
      if (event.data.id !== 1) return;
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.value as T);
    };
    worker.postMessage({ id: 1, method, args });
  }), { method, args });
}

export async function seedDiary(page: Page, foods: Food[] = [], records: PersonalRecord[] = []) {
  await openDiary(page);
  const archive: Archive = {
    format: 'gramello', version: 1, exportedAt: new Date().toISOString(),
    records: [...foods.map(value => ({ kind: 'food' as const, id: value.id, date: null, value })), ...records],
  };
  await localDiary(page, 'importArchive', [JSON.stringify(archive)]);
  await openDiary(page);
}

export async function savedEntries(page: Page) {
  const archive = await localDiary<Archive>(page, 'exportArchive');
  return archive.records.flatMap(record => record.kind === 'entry' ? [record.value] : []);
}
