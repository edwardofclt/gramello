import { test, expect } from './fixtures';
import { productFood } from '../../lib/barcode-food';
import { ghostProduct } from '../fixtures/ghost-energy';

for (const unit of ['serving', 'milliliters', 'fluid-ounces'] as const) {
  test(`logs and persists the Ghost barcode by ${unit}`, async ({ page }) => {
    await page.route('**/api/foods/barcode?*', route => {
      expect(new URL(route.request().url()).searchParams.get('code')).toBe('810128528191');
      return route.fulfill({ json: { food: productFood(ghostProduct, '810128528191') } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
    await page.getByRole('button', { name: 'Scan barcode', exact: true }).click();
    await page.getByRole('textbox', { name: 'Barcode number' }).fill('810128528191');
    await page.getByRole('button', { name: 'Look up barcode', exact: true }).click();
    await expect(page.getByText('Choose amount', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Measure', { exact: true }).locator('option')).toHaveText(['Servings (16 fl oz)', 'mL', 'US fl oz']);
    await expect(page.locator('.nutrition-preview')).toContainText('10');
    await page.getByLabel('Measure', { exact: true }).selectOption(unit);
    const amount = unit === 'serving' ? '0.5' : unit === 'milliliters' ? '236.588' : '8';
    await page.getByRole('spinbutton').fill(amount);
    await expect(page.locator('.nutrition-preview')).toContainText('5');
    const response = page.waitForResponse(r => r.url().endsWith('/api/entries') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Add to Lunch', exact: true }).click();
    const entry = await (await response).json();
    expect(entry).toMatchObject({ sourceId: 'off-0810128528191', meal: 'Lunch', quantity: Number(amount), unit, grams: 0 });
    expect(entry.calories).toBeCloseTo(5, 4);
    expect(entry.carbs).toBeCloseTo(1, 4);
    await page.reload();
    await expect(page.locator('.food-row')).toContainText('Energy Drink');
    await expect(page.locator('.food-row')).toContainText(unit === 'serving' ? '0.5 servings' : unit === 'milliliters' ? '236.59 mL' : '8 US fl oz');
    await expect(page.locator('.food-cal')).toHaveText('5');
  });
}
