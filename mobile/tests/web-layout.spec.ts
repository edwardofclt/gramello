import { expect, test } from '@playwright/test';

test('desktop diary keeps its selected day through navigation and opens centered dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('https://gramello.test/api/**', route => route.fulfill({
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type' },
    json: { goals: { calories: 2000, protein: 150, carbs: 200, fat: 67 }, entries: [], days: [] },
  }));
  await page.goto('/?testName=Alexandria%20Longdisplayname');
  await page.getByRole('button', { name: /Continue with Gramello|Sign in to Gramello/ }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  const breakfast = await page.getByTestId('meal-Breakfast').boundingBox();
  const lunch = await page.getByTestId('meal-Lunch').boundingBox();
  expect(breakfast!.y).toBe(lunch!.y);
  expect(lunch!.x).toBeGreaterThan(breakfast!.x + breakfast!.width);
  await page.getByRole('button', { name: 'Previous day' }).click();
  const selectedDay = await page.getByTestId('selected-date').innerText();
  await page.getByRole('button', { name: 'Trends tab', exact: true }).click();
  await expect(page.getByText('Nutrition trends', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Diary tab', exact: true }).click();
  await expect(page.getByTestId('selected-date')).toHaveText(selectedDay);
  await page.getByRole('button', { name: 'Add food', exact: true }).click();
  const dialog = page.getByTestId('app-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Add food', exact: true })).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(650);
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add food', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Edit goals', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Calories (kcal)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.screenshot({ path: 'test-results/web-desktop-diary.png', fullPage: true });
  await page.setViewportSize({ width: 761, height: 1000 });
  await page.getByRole('button', { name: 'Trends tab', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(761);
  const account = page.getByRole('button', { name: 'Account menu', exact: true });
  await account.focus();
  await page.keyboard.press('Enter');
  const popup = page.getByRole('group', { name: 'Your account' });
  await expect(popup.getByText('Alexandria Longdisplayname')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(popup.getByRole('button', { name: 'Daily goals' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(account).toBeFocused();
});

test('diary and interactive trends adapt from desktop through tablet to a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const requests: number[] = [];
  const goals = { calories: 2400, protein: 180, carbs: 250, fat: 70 };
  const entries = [
    { id: '1', meal: 'Breakfast', name: 'Greek yogurt & blueberries', source: 'USDA reference', quantity: 250, unit: 'grams', grams: 250, calories: 280, protein: 24, carbs: 35, fat: 5 },
    { id: '2', meal: 'Breakfast', name: 'Whole grain toast', source: 'USDA reference', quantity: 80, unit: 'grams', grams: 80, calories: 210, protein: 8, carbs: 36, fat: 4 },
    { id: '3', meal: 'Lunch', name: 'Chicken & avocado bowl', source: 'USDA reference', quantity: 380, unit: 'grams', grams: 380, calories: 620, protein: 48, carbs: 56, fat: 22 },
    { id: '4', meal: 'Snacks', name: 'Apple with almond butter', source: 'USDA reference', quantity: 200, unit: 'grams', grams: 200, calories: 240, protein: 6, carbs: 28, fat: 13 },
  ];
  const days = [2100, 2380, 2450, 2200, 2500, 1980, 2350].map((calories, i) => ({ date: `2026-09-${13 + i}`, calories, protein: 140 + i * 9, carbs: 210 + i * 8, fat: 55 + i * 2 }));
  await page.route('https://gramello.test/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/trends' && route.request().method() !== 'OPTIONS') requests.push(Number(url.searchParams.get('days')));
    return route.fulfill({ headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type' }, json: { goals, entries, days } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to Gramello' }).click();
  await expect(page.getByText('Chicken & avocado bowl')).toBeVisible();
  await page.screenshot({ path: 'test-results/web-desktop-populated.png', fullPage: true });
  await page.getByRole('button', { name: 'Trends tab', exact: true }).click();
  const chart = page.getByTestId('calories-chart');
  await expect(chart.getByText('2,350 kcal · goal 2,400', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous calories chart day' }).click();
  await expect(chart.getByText('1,980 kcal · goal 2,400', { exact: true })).toBeVisible();
  await expect(page.getByTestId('macros-chart')).toBeVisible();
  await page.screenshot({ path: 'test-results/web-desktop-trends.png', fullPage: true });
  await page.getByRole('button', { name: '30 days', exact: true }).click();
  await expect(chart).toBeVisible();
  await page.getByRole('button', { name: '6 months', exact: true }).click();
  await expect(chart).toBeVisible();
  expect(requests).toEqual([7, 30, 183]);
  await page.getByRole('button', { name: 'Diary tab', exact: true }).click();
  await page.getByRole('button', { name: 'Trends tab', exact: true }).click();
  await expect(chart).toBeVisible();
  expect(requests).toEqual([7, 30, 183, 183]);
  await page.getByRole('button', { name: 'Diary tab', exact: true }).click();
  for (const width of [820, 760, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId('meal-Breakfast')).toBeVisible();
    await expect.poll(async () => {
      const breakfast = (await page.getByTestId('meal-Breakfast').boundingBox())!;
      const lunch = (await page.getByTestId('meal-Lunch').boundingBox())!;
      return width > 760 ? lunch.y === breakfast.y : lunch.y >= breakfast.y + breakfast.height;
    }).toBe(true);
    const breakfast = (await page.getByTestId('meal-Breakfast').boundingBox())!;
    expect(breakfast.x).toBeGreaterThanOrEqual(0);
    expect(breakfast.x + breakfast.width).toBeLessThanOrEqual(width);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(width > 760 ? 1 : 0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: 'test-results/web-narrow-diary.png', fullPage: true });
});

test('food amount and goals remain reachable in short browser dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  let saved: Record<string, unknown> | undefined;
  await page.route('https://gramello.test/api/**', route => {
    const request = route.request();
    if (request.method() === 'POST') saved = request.postDataJSON();
    return route.fulfill({ headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT' },
      json: { goals: { calories: 2000, protein: 150, carbs: 200, fat: 67 }, entries: [], foods: [{ id: 'oats', name: 'Rolled oats with a long product name for a narrow display', source: 'USDA reference', servingLabel: '40 g', servingGrams: 40, calories: 380, protein: 14, carbs: 66, fat: 6 }] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to Gramello' }).click();
  await page.getByRole('button', { name: 'Add food', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods' }).fill('oats');
  await page.getByRole('button', { name: /Rolled oats/ }).click();
  await page.getByRole('textbox', { name: 'Servings (40 g)' }).fill('2');
  const dialog = page.getByTestId('app-dialog');
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(16);
  expect(box.y + box.height).toBeLessThanOrEqual(552);
  await page.getByRole('button', { name: 'Add to breakfast', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toMatchObject({ quantity: 2, unit: 'serving', grams: 80, calories: 304 });
  await page.getByRole('button', { name: 'Edit goals', exact: true }).click();
  await page.getByRole('textbox', { name: 'Fat (grams)' }).fill('70');
  await page.screenshot({ path: 'test-results/web-short-goals.png', fullPage: true });
  await page.getByRole('button', { name: 'Save daily goals' }).click();
  await expect(dialog).toHaveCount(0);
});
