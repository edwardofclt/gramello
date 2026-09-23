import { expect, test, type Route } from '@playwright/test';

const day = { goals: { calories: 2000, protein: 150, carbs: 200, fat: 67 }, entries: [] };

test('opens automatically after creating one diary cookie before parallel requests', async ({ page }) => {
  const requests: string[] = [];
  let firstRequest!: Route;
  await page.route('**/api/**', async route => {
    const request = route.request();
    requests.push(new URL(request.url()).pathname);
    expect(request.headers().authorization).toBeUndefined();
    if (requests.length === 1) { firstRequest = route; return; }
    expect(request.headers().cookie).toContain('gramello_diary=browser-test');
    await route.fulfill({ json: day });
  });
  await page.goto('/');
  await expect(page.getByText('Opening your diary…', { exact: true })).toBeVisible();
  await expect.poll(() => requests).toEqual(['/api/day']);
  await expect(page.getByRole('button', { name: 'Add food', exact: true })).toHaveCount(0);
  await firstRequest.fulfill({ json: day, headers: { 'set-cookie': 'gramello_diary=browser-test; Path=/; HttpOnly; SameSite=Lax' } });
  await expect(page.getByText('Food diary', { exact: true })).toBeVisible();
  await expect.poll(() => requests.length).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: /Sign in|Sign out|Account menu/ })).toHaveCount(0);
});

test('retries opening the diary after an unavailable API', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/**', route => {
    requests += 1;
    return requests === 1
      ? route.fulfill({ status: 503, json: { error: 'Diary unavailable. Try again.' } })
      : route.fulfill({ json: day });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Diary unavailable');
  await expect(page.getByRole('button', { name: 'Add food', exact: true })).toHaveCount(0);
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Food diary', { exact: true })).toBeVisible();
});
