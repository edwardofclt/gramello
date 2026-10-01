import { test as base, expect, chromium, firefox, webkit, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const test = base.extend({ context: async ({ browserName }, use) => {
  const profile = await mkdtemp(join(tmpdir(), 'gramello-pack-profile-'));
  const context = await ({ chromium, firefox, webkit }[browserName]).launchPersistentContext(profile, { baseURL: 'http://127.0.0.1:5199' });
  try { await use(context); } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
} });
const call = (page: Page, method: string, value?: unknown) => page.evaluate(({ method, value }) => (window as any).call(method, value), { method, value });
test.beforeEach(async ({ page, request }) => { await request.get('/control'); await page.goto('/'); await page.waitForFunction(() => !!(window as any).call); });
test('route indexing uses bounded read transactions and one atomic commit on activation, replacement and retirement', async ({ page }) => {
  expect(await call(page, 'batchRoutes')).toEqual({
    activation: { readonly: 3, readwrite: 1 }, replacement: { readonly: 7, readwrite: 1 }, retirement: { readonly: 7, readwrite: 1 },
    installed: 1, replaced: 1, retired: { packs: [], complete: false },
  });
});
test('batch snapshot reads preserve order and missing values and reject aborted transactions', async ({ page }) => {
  expect(await call(page, 'batchRead')).toEqual({ values: ['last', undefined, 'first', 'last'], empty: [], readSucceeded: true, aborted: true });
});
test('compiled application isolates documents and offline worker assets', async ({ request }) => {
  for (const path of ['/', '/offline/diary-worker.js', '/offline/sqlite3-opfs-async-proxy.js']) {
    const response = await request.get('http://127.0.0.1:5198' + path);
    expect(response.ok()).toBe(true); expect(response.headers()['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  }
});
test('reclaims terminated transfers while preserving a live cross-tab download', async ({ page, context }) => {
  await call(page, 'update');
  void call(page, 'stageNever').catch(() => {}); // Intentionally dies with this tab.
  const other = await context.newPage(); await other.goto('/'); await call(other, 'info');
  const partials = async () => (await call(other, 'files')).filter((name: string) => name.startsWith('partial-'));
  await expect.poll(partials).toHaveLength(1);
  const update = call(other, 'update');
  await expect.poll(async () => (await call(other, 'locks')).pending.some((lock: any) => lock.name === 'gramello:food-pack-update')).toBe(true);
  expect(await partials()).toHaveLength(1);
  await page.close(); expect(['current', 'updated']).toContain((await update).phase);
  expect(await partials()).toEqual([]); expect((await call(other, 'search')).foods).toHaveLength(2);
});
test('OPFS warms without full-file reads and persists direct USDA routes offline', async ({ page, context, browserName }) => {
  const status = await call(page, 'update');
  expect(status.phase, JSON.stringify(status)).toBe('updated');
  await call(page, 'search'); await call(page, 'resetMetrics');
  expect((await call(page, 'search')).foods.map((food: any) => food.id).sort()).toEqual(['off-0030771094625', 'usda-1892562']);
  const info = await call(page, 'info'); expect(info.direct, JSON.stringify(info)).toBe(true);
  expect(info.entries.every((entry: any) => entry.location === 'opfs')).toBe(true);
  expect(info.metrics).toMatchObject({ hashes: 0, fileReads: 0, snapshotReads: 0, peak: 1, open: 0 });
  await page.reload(); await call(page, 'info');
  await call(page, 'resetMetrics');
  expect((await call(page, 'search')).foods).toHaveLength(2);
  expect((await call(page, 'info')).metrics).toMatchObject({ hashes: 0, fileReads: 0, snapshotReads: 0, peak: 1, open: 0 });
  // WebKit's protocol offline switch can make cold OPFS reads fail too. Block
  // every network request without disabling local storage in that engine.
  if (browserName === 'webkit') await context.route(/^https?:\/\//, route => route.abort('internetdisconnected'));
  else await context.setOffline(true);
  expect((await call(page, 'get', 'usda-1892562')).id).toBe('usda-1892562');
  expect((await call(page, 'barcode')).id).toBe('usda-1892562');
});
test('legacy snapshots remain readable without search-triggered storage migration', async ({ page }) => {
  const packs = await call(page, 'legacy'); await call(page, 'configure', { failCommit: true });
  expect((await call(page, 'search')).foods).toHaveLength(2);
  expect((await call(page, 'info')).entries[0].location).toBeUndefined();
  expect((await call(page, 'values', packs[0].id)).bytes).toBeTruthy();
  await call(page, 'configure', {}); await call(page, 'search');
  const info = await call(page, 'info'); expect(info.entries.every((entry: any) => entry.location === undefined)).toBe(true);
  for (const pack of packs) expect((await call(page, 'values', pack.id)).bytes).toBeTruthy();
  await page.reload(); expect((await call(page, 'search')).foods).toHaveLength(2);
});
test('prepares existing downloads offline outside search without rehashing or redownloading', async ({ page, context, browserName }) => {
  await call(page, 'update'); await call(page, 'clearSearchIndex');
  await page.reload(); await call(page, 'info'); await call(page, 'resetMetrics');
  if (browserName === 'webkit') await context.route(/^https?:\/\//, route => route.abort('internetdisconnected'));
  else await context.setOffline(true);
  const pending = await call(page, 'search');
  expect(pending.foods).toHaveLength(0); expect(pending.issues.length).toBeGreaterThan(0);
  expect((await call(page, 'info')).metrics).toMatchObject({ hashes: 0, fileReads: 0, snapshotReads: 0, peak: 0 });
  await call(page, 'prepareSearch');
  expect((await call(page, 'search')).foods).toHaveLength(2);
  expect((await call(page, 'info')).metrics.hashes).toBe(0);
});
test('unsupported isolation reads downloaded OPFS packs asynchronously', async ({ page }) => {
  await call(page, 'update');
  await page.goto('/no-isolation'); expect((await call(page, 'info')).direct).toBe(false);
  expect((await call(page, 'search')).foods).toHaveLength(2);
  expect((await call(page, 'info')).entries.every((entry: any) => entry.location === 'opfs')).toBe(true);
  await call(page, 'unavailable'); const result = await call(page, 'search');
  expect(result.issues.length).toBeGreaterThan(0); expect((await call(page, 'info')).entries).toHaveLength(2);
});
test('same-size file corruption is rejected and repaired in one update', async ({ page }) => {
  await call(page, 'update'); await call(page, 'search'); await call(page, 'corrupt');
  const result = await call(page, 'search'); expect(result.issues.some((issue: any) => issue.source === 'Open Food Facts')).toBe(true);
  expect((await call(page, 'update')).phase).toBe('updated'); expect((await call(page, 'search')).foods).toHaveLength(2);
});
test('two tabs retain old repartition coverage during a failed update', async ({ page, context, request }) => {
  await call(page, 'update'); const other = await context.newPage(); await other.goto('/'); await call(other, 'info');
  await request.get('/control?generation=1&fail=true&delay=100');
  const update = call(page, 'update'); const search = call(other, 'search');
  expect((await update).phase).toBe('error'); expect((await search).foods).toHaveLength(2);
  expect((await call(other, 'info')).entries).toHaveLength(3);
  expect((await call(other, 'get', 'usda-1892562')).id).toBe('usda-1892562');
  await request.get('/control?generation=1'); expect((await call(page, 'update')).phase).toBe('updated');
  expect((await call(other, 'info')).entries).toHaveLength(2); expect((await call(other, 'search')).foods).toHaveLength(2);
});
