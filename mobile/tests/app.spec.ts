import { test, expect } from '@playwright/test';

test('logs a measured food, changes goals, reads trends, and clears the diary on sign-out', async ({ page }) => {
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
  await expect(page.getByText('A little more', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-welcome.png', fullPage: true });
  await page.getByRole('button', { name: 'Continue with Nourish' }).click();
  await expect(page.getByText('Food diary', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Breakfast', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods' }).fill('oats');
  await page.getByRole('button', { name: /Rolled oats/ }).click();
  await page.getByRole('button', { name: 'Grams', exact: true }).click();
  await page.getByRole('textbox', { name: 'Weight in grams' }).fill('50');
  await page.getByRole('button', { name: 'Add to breakfast', exact: true }).click();
  await expect(page.getByText('Rolled oats', { exact: true })).toBeVisible();
  expect(entries[0]).toMatchObject({ grams: 50, calories: 190, protein: 7, carbs: 33, fat: 3, meal: 'Breakfast' });
  await page.screenshot({ path: 'test-results/mobile-diary.png', fullPage: true });
  await page.getByRole('button', { name: 'Settings tab', exact: true }).click();
  await page.getByRole('textbox', { name: 'Protein (grams)' }).fill('160');
  await page.getByRole('button', { name: 'Save daily goals' }).click();
  await expect(page.getByText('Daily goals saved.', { exact: false })).toBeVisible();
  expect(goals).toMatchObject({ protein: 160, calories: 2043 });
  await page.screenshot({ path: 'test-results/mobile-settings.png', fullPage: true });
  await page.getByRole('button', { name: 'Trends tab', exact: true }).click();
  await expect(page.getByText('1 logged day in this period')).toBeVisible();
  await page.getByRole('button', { name: '30 days', exact: true }).click();
  await expect(page.getByText('1 logged day in this period')).toBeVisible();
  await page.getByRole('button', { name: 'Diary tab', exact: true }).click();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove Rolled oats' }).click();
  await expect(page.getByText('Rolled oats', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings tab', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue with Nourish' })).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  expect(errors).toEqual([]);
});
