import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`edits a logged food, preserves failed edits, and keeps removal separate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const original = { id: 'entry-1', name: 'Rolled oats', source: 'USDA', meal: 'Breakfast', quantity: 50, unit: 'grams', grams: 50, calories: 190, protein: 7, carbs: 33, fat: 3 };
    let entry = { ...original };
    let failSave = true;
    const writes: unknown[] = [];
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      let body: unknown = {};
      if (url.pathname === '/api/day') body = { goals: { calories: 2000, protein: 150, carbs: 200, fat: 67 }, entries: [entry] };
      if (url.pathname === '/api/water') body = { date: '2026-09-22', goal: { goalMl: 2000, unit: 'ml' }, entries: [], totalMl: 0 };
      if (url.pathname === '/api/entries' && request.method() === 'PUT') {
        writes.push({ id: url.searchParams.get('id'), ...request.postDataJSON() });
        if (failSave) { failSave = false; return route.fulfill({ status: 503, json: { error: 'Please try saving again.' } }); }
        entry = { ...entry, ...request.postDataJSON(), grams: 100, calories: 380, protein: 14, carbs: 66, fat: 6 };
        body = entry;
      }
      return route.fulfill({ json: body });
    });
    await page.goto('/');
    const edit = page.getByRole('button', { name: 'Edit Rolled oats', exact: true });
    await edit.click();
    const amount = page.getByRole('textbox', { name: 'Weight in grams', exact: true });
    await expect(amount).toHaveValue('50');
    await amount.fill('0');
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(writes).toEqual([]);
    await edit.click();
    await expect(amount).toHaveValue('50');
    await amount.fill('100');
    await page.getByRole('button', { name: 'Dinner', exact: true }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Please try saving again.', { exact: true })).toBeVisible();
    await expect(amount).toHaveValue('100');
    await page.screenshot({ path: `test-results/edit-food-${width}.png` });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('app-dialog')).toHaveCount(0);
    expect(writes).toEqual(Array(2).fill({ id: 'entry-1', meal: 'Dinner', quantity: 100, unit: 'grams' }));
    await expect(page.getByTestId('meal-Dinner')).toContainText('Rolled oats');
    await expect(page.getByLabel('380 of 2000 calories logged')).toBeVisible();
    await expect(edit).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove Rolled oats', exact: true }).click();
    await expect(page.getByText('Remove food?', { exact: true })).toBeVisible();
    await expect(amount).toHaveCount(0);
    await page.getByRole('button', { name: 'Keep food', exact: true }).click();
    await edit.click();
    await expect(amount).toHaveValue('100');
  });
}
