import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import type { Archive } from '../../mobile/src/local/records';
import { localDate } from '../../lib/diary-date';

async function workerCall<T>(page: Page, method: string, args: unknown[] = []): Promise<T> {
  return page.evaluate(({ method, args }) => new Promise((resolve, reject) => {
    const worker = new Worker('/offline/diary-worker.js', { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Local worker did not answer')); }, 30000);
    worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
    worker.onmessage = ({ data }) => { if (data.id !== 1) return; clearTimeout(timer); worker.terminate(); if (data.error) reject(new Error(data.error)); else resolve(data.value); };
    worker.postMessage({ id: 1, method, args });
  }), { method, args }) as Promise<T>;
}

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Loading your diary…', { exact: true })).toBeHidden();
}
async function settings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).click();
}
async function nativeArchive(): Promise<Archive> {
  const archive = JSON.parse(await readFile(new URL('../fixtures/native-browser-parity.gramello', import.meta.url), 'utf8')) as Archive;
  for (const record of archive.records) {
    if (record.kind === 'entry' || record.kind === 'water') { record.date = localDate(); record.value.date = localDate(); }
  }
  return archive;
}

test('native backup imports, exports losslessly, and recovers the previous browser diary', async ({ page }) => {
  await open(page);
  expect(await workerCall(page, 'hasRecovery')).toBe(false);
  await page.getByRole('button', { name: '+ 250 mL', exact: true }).click();
  await expect(page.locator('.water-total')).toContainText('250');
  const archive = await nativeArchive();
  await settings(page);
  await page.getByLabel('Choose Gramello backup').setInputFiles({ name: 'phone.gramello', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) });
  await expect(page.getByRole('dialog')).toContainText(`${archive.records.length} records`);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await workerCall<Archive>(page, 'exportArchive')).records.some(record => record.kind === 'water')).toBe(true);
  await page.getByLabel('Choose Gramello backup').setInputFiles({ name: 'phone.gramello', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) });
  await page.getByRole('button', { name: 'Replace and import', exact: true }).click();
  await expect(page.locator('.food-row')).toContainText('Native soup');
  await expect(page.locator('.calorie-focus h2')).toContainText('300');
  await settings(page);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const download = await downloaded;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as Archive;
  expect(exported.records).toEqual(archive.records);
  await page.getByRole('button', { name: 'Recover previous diary', exact: true }).click();
  await page.getByRole('button', { name: 'Recover diary', exact: true }).click();
  await expect(page.locator('.food-row')).toHaveCount(0);
  await expect(page.locator('.water-total')).toContainText('250');
});

test('reloads offline, searches the bundled catalog, and persists a food without a server', async ({ page, context }) => {
  test.setTimeout(90000);
  await open(page);
  await settings(page);
  await expect(page.getByTestId('offline-status')).toHaveText('Ready to use offline', { timeout: 60000 });
  await context.setOffline(true);
  await open(page);
  expect(await page.locator('img.logo-mark').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Add Breakfast', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods', exact: true }).fill('banana');
  await expect(page.locator('.result-row').first()).toBeVisible({ timeout: 30000 });
  await page.locator('.result-row').first().click();
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  await expect(page.locator('.food-row')).toHaveCount(1);
  await open(page);
  await expect(page.locator('.food-row')).toHaveCount(1);
  expect((await workerCall<Archive>(page, 'exportArchive')).records.filter(record => record.kind === 'entry')).toHaveLength(1);
});

test('concurrent tabs preserve both writes and another browser has a private diary', async ({ page, context, browser }) => {
  await open(page);
  const other = await context.newPage();
  await open(other);
  await Promise.all([
    workerCall(page, 'addWater', [{ date: localDate(), amountMl: 250 }]),
    workerCall(other, 'addWater', [{ date: localDate(), amountMl: 500 }]),
  ]);
  const data = await workerCall<Archive>(page, 'exportArchive');
  expect(data.records.filter(record => record.kind === 'water').map(record => record.value.amountMl).sort()).toEqual([250, 500]);
  await workerCall(page, 'createFood', [{ name: 'Private test soup', servingLabel: 'bowl', servingGrams: null, calories: 250, protein: 10, carbs: 30, fat: 10 }]);
  const separate = await browser.newContext();
  try {
    const privatePage = await separate.newPage();
    await privatePage.goto(new URL('/', page.url()).href);
    await expect(privatePage.locator('.app-shell')).toBeVisible({ timeout: 30000 });
    expect((await workerCall<Archive>(privatePage, 'exportArchive')).records).toEqual([]);
  } finally { await separate.close(); }
});

test('migrates all hosted history once and leaves the server copy untouched', async ({ page, context, baseURL }) => {
  await context.request.get('/api/day');
  const origin = new URL(baseURL!).origin;
  const saved = await context.request.post('/api/water', { headers: { Origin: origin }, data: { date: '2020-02-29', amountMl: 123.5 } });
  expect(saved.ok()).toBe(true);
  await open(page);
  const archive = await workerCall<Archive>(page, 'exportArchive');
  expect(archive.records).toEqual([expect.objectContaining({ kind: 'water', date: '2020-02-29', value: expect.objectContaining({ amountMl: 123.5 }) })]);
  await open(page);
  expect((await workerCall<Archive>(page, 'exportArchive')).records).toEqual(archive.records);
  expect((await (await context.request.get('/api/backup')).json()).records).toEqual(archive.records);
});

test('an explicit empty import after failed migration preserves recovery and blocks later automatic migration', async ({ page }) => {
  await page.route('**/api/backup', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await open(page);
  await expect(page.getByRole('button', { name: 'Retry previous diary' })).toBeVisible();
  const original = await nativeArchive();
  await workerCall(page, 'importArchive', [JSON.stringify(original)]);
  await workerCall(page, 'importArchive', [JSON.stringify({ ...original, records: [] })]);
  expect(await workerCall(page, 'needsHostedMigration')).toBe(false);
  let calls = 0;
  await page.unroute('**/api/backup');
  await page.route('**/api/backup', route => { calls++; return route.fulfill({ json: original }); });
  await open(page);
  expect(calls).toBe(0);
  expect((await workerCall<Archive>(page, 'exportArchive')).records).toEqual([]);
  await workerCall(page, 'restorePrevious');
  expect((await workerCall<Archive>(page, 'exportArchive')).records).toEqual(original.records);
});
