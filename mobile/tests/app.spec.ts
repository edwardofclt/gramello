import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
test(`logs food, saves goals, reads trends, and signs out at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const entries: Record<string, unknown>[] = [];
  let goals = { calories: 2000, protein: 150, carbs: 200, fat: 67 };
  await page.route('https://nourish.test/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    expect(request.headers().authorization).toBe('Bearer ui-test-access-token');
    let body: unknown = {};
    if (url.pathname === '/api/day') body = { goals, entries };
    if (url.pathname === '/api/foods/search') body = { foods: [{ id: 'oats', name: 'Rolled oats', source: 'USDA reference', calories: 380, protein: 14, carbs: 66, fat: 6, servingGrams: 40, servingLabel: '40 g' }] };
    if (url.pathname === '/api/entries' && request.method() === 'POST') { body = { id: 'entry-1', ...request.postDataJSON() }; entries.push(body as Record<string, unknown>); }
    if (url.pathname === '/api/entries' && request.method() === 'DELETE') { entries.splice(0); body = { ok: true }; }
    if (url.pathname === '/api/goals') { goals = request.postDataJSON(); body = goals; }
    if (url.pathname === '/api/trends') body = { days: [{ date: '2026-09-19', calories: 1900, protein: 140, carbs: 200, fat: 60 }] };
    return route.fulfill({ json: body, headers });
  });
  await page.goto('/');
  await expect(page.getByText('Your nutrition,', { exact: false })).toBeVisible();
  await page.screenshot({ path: `test-results/web-${width}-welcome.png`, fullPage: true });
  await page.getByRole('button', { name: 'Sign in to Gramello' }).click();
  await expect(page.getByText('Food diary', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Breakfast', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods' }).fill('oats');
  await page.getByRole('button', { name: /Rolled oats/ }).click();
  await page.getByRole('button', { name: 'Grams', exact: true }).click();
  await page.getByRole('textbox', { name: 'Weight in grams' }).fill('50');
  await page.getByRole('button', { name: 'Add to breakfast', exact: true }).click();
  await expect(page.getByText('Rolled oats', { exact: true })).toBeVisible();
  expect(entries[0]).toMatchObject({ grams: 50, calories: 190, protein: 7, carbs: 33, fat: 3, meal: 'Breakfast' });
  await page.screenshot({ path: `test-results/web-${width}-diary.png`, fullPage: true });
  await page.getByRole('button', { name: 'Edit goals', exact: true }).click();
  await page.getByRole('textbox', { name: 'Protein (grams)' }).fill('160');
  await page.screenshot({ path: `test-results/web-${width}-goals.png`, fullPage: true });
  await page.getByRole('button', { name: 'Save daily goals' }).click();
  await expect(page.getByTestId('app-dialog')).toHaveCount(0);
  expect(goals).toMatchObject({ protein: 160, calories: 2043 });
  await expect(page.getByLabel('190 of 2043 calories logged')).toBeVisible();
  await page.getByRole('button', { name: 'Trends tab', exact: true }).click();
  await expect(page.getByText('1 logged day in this period.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '30 days', exact: true }).click();
  await expect(page.getByText('1 logged day in this period.', { exact: false })).toBeVisible();
  await page.screenshot({ path: `test-results/web-${width}-trends.png`, fullPage: true });
  await page.getByRole('button', { name: 'Diary tab', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Rolled oats' }).click();
  await page.getByRole('button', { name: 'Keep food', exact: true }).click();
  await expect(page.getByText('Rolled oats', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Rolled oats' }).click();
  await page.getByRole('button', { name: 'Remove food', exact: true }).click();
  await expect(page.getByText('Rolled oats', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to Gramello' })).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  expect(errors).toEqual([]);
});
}
