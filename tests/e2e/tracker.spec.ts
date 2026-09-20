import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { execFileSync } from 'node:child_process';

const foods = [
  { id: 'test-oats', name: 'Rolled oats', source: 'USDA reference', calories: 400, protein: 10, carbs: 60, fat: 10, servingGrams: 40, servingLabel: '40 g' },
  { id: 'test-brand', name: 'Brand granola', brand: 'Test Kitchen', source: 'Open Food Facts', calories: 500, protein: 12, carbs: 65, fat: 20, servingGrams: 30, servingLabel: '30 g' },
];

async function openDiary(page: Page) {
  const loaded = page.waitForResponse(r => r.url().includes('/api/day') && r.ok());
  await page.goto('/');
  await loaded;
  await expect(page.getByText('Loading your diary…')).toBeHidden();
}

async function search(page: Page, results = foods) {
  // Only food search is stubbed: external providers are rate-limited and change data.
  await page.route('**/api/foods/search?*', route => route.fulfill({ json: { foods: results } }));
  await page.getByRole('button', { name: 'Add Breakfast', exact: true }).click();
  await page.getByPlaceholder('Try chicken breast, oats, or a brand…').fill('oats');
  await expect(page.locator('.result-row')).toHaveCount(results.length);
}

test('generic and branded foods scale by servings and grams and survive reload', async ({ page }) => {
  await openDiary(page);
  await search(page);
  await page.getByRole('button', { name: /Rolled oats USDA reference/ }).click();
  await page.getByRole('spinbutton').fill('2');
  await expect(page.locator('.nutrition-preview')).toContainText('320');
  const saved = page.waitForResponse(r => r.url().endsWith('/api/entries') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  expect((await saved).status()).toBe(201);
  expect(await (await saved).json()).toMatchObject({ grams: 80, calories: 320, protein: 8, carbs: 48, fat: 8 });
  await search(page);
  await page.getByRole('button', { name: /Brand granola Test Kitchen/ }).click();
  await page.getByRole('combobox').nth(1).selectOption('grams');
  await page.getByRole('spinbutton').fill('60');
  await expect(page.locator('.nutrition-preview')).toContainText('300');
  const branded = page.waitForResponse(r => r.url().endsWith('/api/entries') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  const brandedEntry = await (await branded).json();
  expect(brandedEntry).toMatchObject({ grams: 60, calories: 300, carbs: 39, fat: 12 });
  expect(brandedEntry.protein).toBeCloseTo(7.2, 6);
  await openDiary(page);
  await expect(page.locator('.food-row')).toHaveCount(2);
  await expect(page.locator('.calorie-focus h2')).toContainText('620');
  await page.getByRole('button', { name: 'Remove Rolled oats', exact: true }).click();
  await expect(page.locator('.food-row')).toHaveCount(1);
  await openDiary(page);
  await expect(page.locator('.food-row')).toHaveCount(1);
  await expect(page.locator('.calorie-focus h2')).toContainText('300');
});

test('macro edits recalculate calories; calorie edits preserve percentages and save', async ({ page }) => {
  await openDiary(page);
  await page.getByRole('button', { name: 'Edit goals', exact: true }).click();
  const fields = page.getByRole('dialog').getByRole('spinbutton');
  await fields.nth(1).fill('150');
  await fields.nth(2).fill('200');
  await fields.nth(3).fill('50');
  await expect(fields.nth(0)).toHaveValue('1850');
  const percentages = await page.locator('.goal-fields small').allTextContents();
  await fields.nth(0).fill('3700');
  await expect(fields.nth(1)).toHaveValue('300');
  await expect(fields.nth(2)).toHaveValue('400');
  await expect(fields.nth(3)).toHaveValue('100');
  await expect(page.locator('.goal-fields small')).toHaveText(percentages);
  await page.getByRole('button', { name: 'Save goals' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await openDiary(page);
  await page.getByRole('button', { name: 'Edit goals', exact: true }).click();
  await expect(fields.nth(0)).toHaveValue('3700');
  await expect(fields.nth(1)).toHaveValue('300');
});

test('search and serving dialogs scroll on a short mobile viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile regression');
  await page.setViewportSize({ width: 390, height: 500 });
  await openDiary(page);
  await search(page, Array.from({ length: 24 }, (_, i) => ({ ...foods[0], id: `food-${i}`, name: `Oats item ${i}` })));
  const dialog = page.getByRole('dialog');
  async function checkScrolling() {
    const geometry = await dialog.evaluate(el => {
      el.scrollTop = 0;
      const before = el.scrollTop;
      el.scrollTop = el.scrollHeight;
      return { before, after: el.scrollTop, overflow: getComputedStyle(el).overflowY, height: el.clientHeight, full: el.scrollHeight };
    });
    expect(['auto', 'scroll']).toContain(geometry.overflow);
    expect(geometry.full).toBeGreaterThan(geometry.height);
    expect(geometry.after).toBeGreaterThan(geometry.before);
  }
  await checkScrolling();
  const last = page.getByRole('button', { name: /Oats item 23 USDA/ });
  await expect(last).toBeInViewport();
  await last.click();
  await expect(page.getByRole('heading', { name: 'Choose amount' })).toBeVisible();
  await checkScrolling();
  const add = page.getByRole('button', { name: 'Add to Breakfast', exact: true });
  await expect(add).toBeInViewport();
  await add.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.food-row')).toContainText('Oats item 23');
});

test('week, month and six-month views request the right range and render charts', async ({ page }) => {
  await openDiary(page);
  await search(page);
  await page.getByRole('button', { name: /Rolled oats USDA reference/ }).click();
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const loaded = page.waitForResponse(r => r.url().includes('/api/trends?days=7') && r.ok());
  await page.getByRole('button', { name: 'Trends', exact: true }).filter({ visible: true }).click();
  await loaded;
  for (const [label, days] of [['30 days', 30], ['6 months', 183], ['7 days', 7]] as const) {
    const response = page.waitForResponse(r => r.url().includes(`/api/trends?days=${days}`) && r.ok());
    await page.getByRole('tab', { name: label, exact: true }).click();
    expect((await (await response).json()).days.length).toBeGreaterThan(0);
    await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.chart-wrap svg').first()).toBeVisible();
  }
});

test('saved food survives a real container restart', async ({ page, request }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.E2E_CONTAINER_NAME, 'Set E2E_CONTAINER_NAME to a disposable local Docker container');
  await openDiary(page);
  await search(page);
  await page.getByRole('button', { name: /Rolled oats USDA reference/ }).click();
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  execFileSync('docker', ['restart', process.env.E2E_CONTAINER_NAME!], { timeout: 30_000 });
  await expect.poll(async () => {
    try { return (await request.get('/api/day', { timeout: 2000 })).status(); } catch { return 0; }
  }, { timeout: 30_000 }).toBe(200);
  await openDiary(page);
  await expect(page.locator('.food-row')).toContainText('Rolled oats');
});
