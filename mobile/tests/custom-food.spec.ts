import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`custom foods are reusable and visibly unverified at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let custom: Record<string, unknown> | undefined;
    const entries: Record<string, unknown>[] = [];
    let failures = 1;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/day') return route.fulfill({ json: { goals: { calories: 2400, protein: 180, carbs: 250, fat: 70 }, entries } });
      if (path === '/api/foods/custom') {
        if (failures--) return route.fulfill({ status: 503, json: { error: 'Temporary save failure. Try again.' } });
        custom = { ...request.postDataJSON(), id: 'custom-bowl', source: 'Community submitted', sourceKind: 'custom', verified: false, nutritionBasis: 'serving' };
        return route.fulfill({ status: 201, json: { food: custom } });
      }
      if (path === '/api/foods/search') return route.fulfill({ json: { foods: custom ? [custom] : [], partial: true, hasMore: true, issues: [{ source: 'Open Food Facts', message: 'The database took too long to respond. Try searching again.' }] } });
      if (path === '/api/entries') {
        const entry = { ...request.postDataJSON(), id: 'entry-1', verified: false, servingLabel: custom!.servingLabel };
        entries.push(entry); return route.fulfill({ status: 201, json: entry });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('/');
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
    const warning = page.getByRole('button', { name: 'Some nutrition databases are unavailable.' });
    await expect(warning).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText(/The database took too long/)).toBeHidden();
    await warning.click();
    await expect(warning).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/Open Food Facts: The database took too long/)).toBeVisible();
    await expect(page.getByText(/Showing the first 100 matches/)).toBeVisible();
    await page.screenshot({ path: `test-results/custom-food-${width}-search.png`, fullPage: true });
    await warning.click();
    await expect(page.getByText(/The database took too long/)).toBeHidden();
    expect(custom).toMatchObject({ calories: 605, protein: 30, carbs: 65, fat: 25, servingGrams: null });
    expect(errors).toEqual([]);
  });
}

test('choosing a serving-only restaurant food resets a previous weight amount', async ({ page }) => {
  const weighted = { id: 'oats', name: 'Rolled oats', source: 'USDA', verified: true, nutritionBasis: '100g', servingGrams: 40, servingLabel: '40 g', calories: 400, protein: 10, carbs: 60, fat: 10 };
  const restaurant = { id: 'restaurant-bowl', name: 'Restaurant bowl', brand: 'Test Kitchen', source: 'Restaurant menu', verified: true, sourceKind: 'restaurant', sourceUrl: 'https://example.com/nutrition', nutritionBasis: 'serving', servingGrams: null, servingLabel: '1 bowl', calories: 600, protein: 30, carbs: 60, fat: 20 };
  const entries: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/day') return route.fulfill({ json: { goals: { calories: 2400, protein: 180, carbs: 250, fat: 70 }, entries } });
    if (path === '/api/foods/search') return route.fulfill({ json: { foods: [weighted, restaurant] } });
    if (path === '/api/entries') {
      entries.push({ ...request.postDataJSON(), id: 'entry-bowl', verified: true, servingLabel: restaurant.servingLabel });
      return route.fulfill({ status: 201, json: entries[0] });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Dinner', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods' }).fill('bowl');
  await page.getByRole('button', { name: /Rolled oats/ }).click();
  await page.getByRole('button', { name: 'Grams', exact: true }).click();
  await page.getByRole('textbox', { name: 'Weight in grams' }).fill('80');
  await page.getByRole('button', { name: 'Back to results', exact: true }).click();
  await page.getByRole('button', { name: /Restaurant bowl/ }).click();
  await expect(page.getByRole('textbox', { name: 'Servings (1 bowl)' })).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'Grams', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ounces', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Verified nutrition source', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View nutrition source' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to dinner', exact: true }).click();
  expect(entries[0]).toMatchObject({ quantity: 1, unit: 'serving', grams: null, calories: 600, protein: 30, carbs: 60, fat: 20 });
});
