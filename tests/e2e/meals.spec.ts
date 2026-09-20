import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const food = { id: 'beef', name: 'Beef fixture', source: 'USDA reference', calories: 200, protein: 20, carbs: 10, fat: 5, servingGrams: 100, servingLabel: '100 g' };
async function ingredient(page: Page, name: string, grams: string) {
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods', exact: true }).fill(name);
  await page.getByRole('button', { name: new RegExp(`${name} fixture`) }).click();
  await page.getByLabel('Measure', { exact: true }).selectOption('grams');
  await page.getByRole('spinbutton', { name: 'Weight in grams' }).fill(grams);
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
}

test('builds, portions, reuses, edits and deletes a saved meal without changing diary history', async ({ page }) => {
  await page.route('**/api/foods/search?*', route => route.fulfill({ json: { foods: [food, { ...food, id: 'tomatoes', name: 'Tomatoes fixture' }] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  await page.getByRole('button', { name: 'My meals', exact: true }).click();
  await page.getByRole('button', { name: 'Create meal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save meal', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Meal name' }).fill('Beef & tomato soup');
  await ingredient(page, 'Beef', '400');
  await ingredient(page, 'Tomatoes', '200');
  await expect(page.getByText(/Estimated from ingredients: 600 g/)).toBeVisible();
  await page.getByLabel('Batch weight unit').selectOption('ounces');
  await page.getByLabel('Finished batch weight (optional)').fill('64');
  await page.getByLabel('Portion by').selectOption('ounces');
  await page.getByRole('spinbutton', { name: 'Ounces per portion' }).fill('16');
  await expect(page.locator('.batch-summary')).toContainText('Whole batch · 1200 kcal');
  await expect(page.locator('.batch-summary')).toContainText('Makes 4 portions');
  await expect(page.locator('.nutrition-preview')).toContainText('300');
  await page.getByRole('button', { name: 'Save meal', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/meal-builder-${test.info().project.name}.png` });
  await page.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Meal saved');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  await page.getByRole('button', { name: 'My meals', exact: true }).click();
  await page.getByRole('button', { name: /Beef & tomato soup 2 ingredients/ }).click();
  await page.getByLabel('Measure', { exact: true }).selectOption('ounces');
  await page.getByRole('spinbutton', { name: 'Weight in ounces' }).fill('16');
  await expect(page.locator('.nutrition-preview')).toContainText('300');
  const response = page.waitForResponse(r => r.url().endsWith('/api/entries') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add to Lunch', exact: true }).click();
  const entry = await (await response).json();
  expect(entry.calories).toBeCloseTo(300, 8);
  expect(entry).toMatchObject({ meal: 'Lunch', source: 'My meals', quantity: 16, unit: 'ounces', protein: 30, carbs: 15, fat: 7.5 });
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  await page.getByRole('button', { name: 'My meals', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Beef & tomato soup', exact: true }).click();
  await page.getByLabel('Amount of Beef fixture').fill('800');
  await expect(page.locator('.batch-summary')).toContainText('2000 kcal');
  await page.getByRole('button', { name: 'Save meal', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Beef & tomato soup', exact: true }).click();
  await page.getByRole('button', { name: 'Delete meal', exact: true }).click();
  await expect(page.getByText('Your recipes, ready to reuse')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.locator('.food-row')).toContainText('Beef & tomato soup');
  await expect(page.locator('.food-cal')).toHaveText('300');
});

test('keeps a meal draft after a failed save and supports fractional servings', async ({ page }) => {
  await page.route('**/api/foods/search?*', route => route.fulfill({ json: { foods: [food] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Breakfast', exact: true }).click();
  await page.getByRole('button', { name: 'My meals', exact: true }).click();
  await page.getByRole('button', { name: 'Create meal', exact: true }).click();
  await page.getByRole('textbox', { name: 'Meal name' }).fill('Saved later');
  await ingredient(page, 'Beef', '600');
  await page.getByRole('spinbutton', { name: 'Number of servings' }).fill('4');
  await expect(page.locator('.nutrition-preview')).toContainText('300');
  await page.route('**/api/meals', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 503, json: { error: 'Test storage is temporarily unavailable.' } });
    return route.continue();
  });
  await page.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByRole('textbox', { name: 'Meal name' })).toHaveValue('Saved later');
  await page.unroute('**/api/meals');
  await page.getByRole('button', { name: 'Save meal', exact: true }).click();
  await page.getByRole('button', { name: /Saved later 1 ingredients/ }).click();
  await page.getByRole('spinbutton', { name: 'Servings', exact: true }).fill('0.5');
  await expect(page.locator('.nutrition-preview')).toContainText('150');
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  await expect(page.locator('.food-cal')).toHaveText('150');
});
