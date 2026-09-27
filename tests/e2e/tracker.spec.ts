import { type Page } from '@playwright/test';
import { test, expect, openDiary, seedDiary, savedEntries, localDiary } from './fixtures';

const foods = [
  { id: 'test-oats', name: 'Rolled oats', brand: 'e2eprivate', source: 'USDA reference', calories: 400, protein: 10, carbs: 60, fat: 10, servingGrams: 40, servingLabel: '40 g' },
  { id: 'test-brand', name: 'Brand granola', brand: 'Test Kitchen e2eprivate', source: 'Open Food Facts', calories: 500, protein: 12, carbs: 65, fat: 20, servingGrams: 30, servingLabel: '30 g' },
];

async function search(page: Page, count = foods.length) {
  await page.getByRole('button', { name: 'Add Breakfast', exact: true }).click();
  await page.getByPlaceholder('Try chicken breast, oats, or a brand…').fill('e2eprivate');
  await expect(page.locator('.result-row')).toHaveCount(count);
}

test('edits a logged food in place, cancels a draft, and persists after reload', async ({ page }) => {
  await seedDiary(page, foods);
  await search(page);
  await page.getByRole('button', { name: /Rolled oats e2eprivate/ }).click();
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const item = page.getByRole('button', { name: 'Edit Rolled oats', exact: true });
  await item.focus();
  await page.keyboard.press('Enter');
  const amount = page.getByRole('spinbutton', { name: 'Servings', exact: true });
  await expect(amount).toHaveValue('1');
  await amount.fill('0');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await amount.fill('2');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.calorie-focus h2')).toContainText('160');
  await item.click();
  await expect(amount).toHaveValue('1');
  await amount.fill('2');
  await page.getByRole('combobox', { name: 'Meal', exact: true }).selectOption('Dinner');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.food-row')).toHaveCount(1);
  await expect(page.locator('.meal-card').filter({ has: page.getByRole('heading', { name: 'Dinner', exact: true }) })).toContainText('Rolled oats');
  await expect(page.locator('.calorie-focus h2')).toContainText('320');
  await openDiary(page);
  await item.click();
  await expect(amount).toHaveValue('2');
  await expect(page.getByRole('combobox', { name: 'Meal', exact: true })).toHaveValue('Dinner');
  await page.screenshot({ path: 'test-results/edit-food-web.png' });
});

test('generic and branded foods scale by servings and grams and survive reload', async ({ page }) => {
  await seedDiary(page, foods);
  await search(page);
  await page.getByRole('button', { name: /Rolled oats e2eprivate/ }).click();
  await page.getByRole('spinbutton').fill('2');
  await expect(page.locator('.nutrition-preview')).toContainText('320');
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await savedEntries(page))[0]).toMatchObject({ grams: 80, calories: 320, protein: 8, carbs: 48, fat: 8 });
  await search(page);
  await page.getByRole('button', { name: /Brand granola Test Kitchen/ }).click();
  await page.getByRole('combobox').nth(1).selectOption('grams');
  await page.getByRole('spinbutton').fill('60');
  await expect(page.locator('.nutrition-preview')).toContainText('300');
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const brandedEntry = (await savedEntries(page)).find(entry => entry.name === 'Brand granola')!;
  expect(brandedEntry).toMatchObject({ grams: 60, calories: 300, carbs: 39, fat: 12 });
  expect(brandedEntry.protein).toBeCloseTo(7.2, 6);
  await openDiary(page);
  await expect(page.locator('.food-row')).toHaveCount(2);
  await expect(page.locator('.calorie-focus h2')).toContainText('620');
  await page.getByRole('button', { name: 'Remove Rolled oats', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.food-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove Rolled oats', exact: true }).click();
  await page.getByRole('button', { name: 'Remove food', exact: true }).click();
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
  await seedDiary(page, Array.from({ length: 24 }, (_, i) => ({ ...foods[0], id: `food-${String(i).padStart(2, '0')}`, name: `Oats item ${String(i).padStart(2, '0')}` })));
  await search(page, 20);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.result-row')).toHaveCount(24);
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
  const last = page.getByRole('button', { name: /Oats item 23 e2eprivate/ });
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

test('week, month and six-month views render charts and a keyboard-accessible day readout', async ({ page }) => {
  await seedDiary(page, foods);
  const historicalDates = await page.evaluate(() => [10, 90].map(days => {
    const date = new Date(); date.setDate(date.getDate() - days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }));
  for (const [index, date] of historicalDates.entries()) {
    await localDiary(page, 'addEntry', [{ date, meal: 'Breakfast', sourceId: 'test-oats', quantity: index + 2, unit: 'serving' }]);
  }
  await search(page);
  await page.getByRole('button', { name: /Rolled oats e2eprivate/ }).click();
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Trends', exact: true }).filter({ visible: true }).click();
  for (const [label, average] of [['30 days', '240'], ['6 months', '320'], ['7 days', '160']] as const) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    await expect(page.getByRole('tab', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.chart-wrap svg').first()).toBeVisible();
    await expect(page.locator('.stat-grid > div').first().locator('strong')).toHaveText(average);
    const inspector = page.getByRole('group', { name: 'Logged day details' });
    await expect(inspector).toContainText('160 kcal');
    const previous = inspector.getByRole('button', { name: 'Previous day' });
    if (label === '7 days') await expect(previous).toBeDisabled();
    else {
      await previous.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(inspector).toContainText('320 kcal');
      await expect(inspector.locator('time')).toHaveAttribute('datetime', historicalDates[0]);
      if (label === '6 months') {
        await page.keyboard.press('ArrowLeft');
        await expect(inspector).toContainText('480 kcal');
        await expect(inspector.locator('time')).toHaveAttribute('datetime', historicalDates[1]);
      }
      await expect(previous).toBeDisabled();
    }
  }
});

test('saved food survives closing and reopening the browser tab', async ({ page, context }) => {
  await seedDiary(page, foods);
  await search(page);
  await page.getByRole('button', { name: /Rolled oats e2eprivate/ }).click();
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.close();
  const reopened = await context.newPage();
  await openDiary(reopened);
  await expect(reopened.locator('.food-row')).toContainText('Rolled oats');
});

test('shows catalog provenance and notices, and resets the portion when choosing another food', async ({ page }) => {
  const restaurant = { ...foods[0], id: 'restaurant-fixture', name: 'Restaurant bowl fixture', source: 'Official menu', sourceKind: 'restaurant' as const, nutritionBasis: 'serving' as const, servingLabel: '1 bowl', servingGrams: null, calories: 650, verified: true, sourceUrl: 'https://example.com/nutrition' };
  await seedDiary(page, [foods[0], restaurant]);
  await page.context().route('https://world.openfoodfacts.org/cgi/search.pl?*', route => route.fulfill({ status: 429, headers: { 'access-control-allow-origin': '*' }, json: { error: 'rate limited' } }));
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods', exact: true }).fill('e2eprivate');
  await expect(page.getByRole('button', { name: /Rolled oats e2eprivate/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search online', exact: true })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Some nutrition databases are unavailable');
  const warning = page.getByRole('button', { name: 'Some nutrition databases are unavailable.' });
  await expect(warning).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(/Too many requests/)).toBeHidden();
  await warning.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Open Food Facts: Too many requests');
  await expect(page.getByText(/Too many requests/)).toBeVisible();
  await warning.click();
  await expect(page.getByText(/Too many requests/)).toBeHidden();
  const bowl = page.getByRole('button', { name: /Restaurant bowl fixture e2eprivate/ });
  await expect(bowl).toContainText('Verified');
  await expect(bowl).toContainText('650 kcal');
  await expect(bowl).toContainText('per 1 bowl');
  await page.getByRole('button', { name: /Rolled oats e2eprivate/ }).click();
  await page.getByLabel('Measure', { exact: true }).selectOption('ounces');
  await page.getByRole('spinbutton', { name: 'Weight in ounces' }).fill('8');
  await page.getByRole('button', { name: 'Back to results', exact: true }).click();
  await bowl.click();
  await expect(page.getByLabel('Measure', { exact: true })).toHaveValue('serving');
  await expect(page.getByLabel('Measure', { exact: true }).locator('option')).toHaveText(['Servings (1 bowl)']);
  await expect(page.getByRole('spinbutton', { name: 'Servings', exact: true })).toHaveValue('1');
  await expect(page.locator('.nutrition-preview')).toContainText('650');
  await expect(page.getByRole('link', { name: 'View nutrition source' })).toHaveAttribute('href', 'https://example.com/nutrition');
});
