import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`custom foods are reusable and visibly unverified at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let custom: Record<string, unknown> | undefined;
    const entries: Record<string, unknown>[] = [];
    let failures = 1;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://nourish.test/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (path === '/api/day') return route.fulfill({ headers, json: { goals: { calories: 2400, protein: 180, carbs: 250, fat: 70 }, entries } });
      if (path === '/api/foods/custom') {
        if (failures--) return route.fulfill({ status: 503, headers, json: { error: 'Temporary save failure. Try again.' } });
        custom = { ...request.postDataJSON(), id: 'custom-bowl', source: 'Community submitted', sourceKind: 'custom', verified: false, nutritionBasis: 'serving' };
        return route.fulfill({ status: 201, headers, json: { food: custom } });
      }
      if (path === '/api/foods/search') return route.fulfill({ headers, json: { foods: custom ? [custom] : [], partial: true } });
      if (path === '/api/entries') {
        const entry = { ...request.postDataJSON(), id: 'entry-1', verified: false, servingLabel: custom!.servingLabel };
        entries.push(entry); return route.fulfill({ status: 201, headers, json: entry });
      }
      return route.fulfill({ headers, json: {} });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in to Nourish' }).click();
    await page.getByRole('button', { name: 'Add Dinner', exact: true }).click();
    await page.getByRole('button', { name: 'Add custom food', exact: true }).click();
    await page.getByRole('button', { name: 'Save custom food' }).click();
    await expect(page.getByRole('alert')).toContainText('all four nutrition values');
    for (const [name, value] of [['Food name', 'My dinner bowl'], ['Serving description', '1 bowl'], ['Calories (kcal)', '605'], ['Protein (g)', '30'], ['Carbs (g)', '65'], ['Fat (g)', '25']]) {
      await page.getByRole('textbox', { name, exact: true }).fill(value);
    }
    await page.screenshot({ path: `test-results/custom-food-${width}-form.png`, fullPage: true });
    await page.getByRole('button', { name: 'Save custom food' }).click();
    await expect(page.getByRole('alert')).toContainText('Temporary save failure');
    await expect(page.getByRole('textbox', { name: 'Calories (kcal)' })).toHaveValue('605');
    await page.getByRole('button', { name: 'Save custom food' }).click();
    await expect(page.getByText('Choose amount', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Unverified nutrition', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grams', exact: true })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Servings (1 bowl)' }).fill('0.5');
    await page.getByRole('button', { name: 'Add to dinner', exact: true }).click();
    expect(entries[0]).toMatchObject({ calories: 302.5, protein: 15, carbs: 32.5, fat: 12.5, grams: null, verified: false, meal: 'Dinner' });
    await expect(page.getByText('My dinner bowl', { exact: true })).toBeVisible();
    await expect(page.getByText(/0.5 × 1 bowl/)).toBeVisible();
    await page.getByRole('button', { name: 'Add Dinner', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search foods' }).fill('My dinner bowl');
    await expect(page.getByRole('button', { name: /My dinner bowl/ })).toBeVisible();
    await expect(page.getByText(/Some nutrition databases are unavailable/)).toBeVisible();
    await page.screenshot({ path: `test-results/custom-food-${width}-search.png`, fullPage: true });
    expect(custom).toMatchObject({ calories: 605, protein: 30, carbs: 65, fat: 25, servingGrams: null });
    expect(errors).toEqual([]);
  });
}
