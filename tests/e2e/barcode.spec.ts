import { test, expect, openDiary, savedEntries } from './fixtures';
import { ghostProduct } from '../fixtures/ghost-energy';

for (const unit of ['serving', 'milliliters', 'fluid-ounces'] as const) {
  test(`logs and persists the Ghost barcode by ${unit}`, async ({ page, context }) => {
    await context.route('https://world.openfoodfacts.org/api/v2/product/*', route => {
      expect(new URL(route.request().url()).pathname).toBe('/api/v2/product/810128528191');
      return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { status: 1, product: { ...ghostProduct, image_front_small_url: 'https://images.openfoodfacts.org/fixture.png' } } });
    });
    await context.route('https://images.openfoodfacts.org/fixture.png', route => route.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1sAAAAASUVORK5CYII=', 'base64') }));
    await openDiary(page);
    await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
    await page.getByRole('button', { name: 'Scan barcode', exact: true }).click();
    await page.getByRole('textbox', { name: 'Barcode number' }).fill('810128528191');
    await page.getByRole('button', { name: 'Look up barcode', exact: true }).click();
    await expect(page.getByText('Choose amount', { exact: true })).toBeVisible();
    await expect(page.locator('.selected-food img')).toHaveJSProperty('naturalWidth', 1);
    await expect(page.getByLabel('Measure', { exact: true }).locator('option')).toHaveText(['Servings (16 fl oz)', 'mL', 'US fl oz']);
    await expect(page.locator('.nutrition-preview')).toContainText('10');
    await page.getByLabel('Measure', { exact: true }).selectOption(unit);
    const amount = unit === 'serving' ? '0.5' : unit === 'milliliters' ? '236.588' : '8';
    await page.getByRole('spinbutton').fill(amount);
    await expect(page.locator('.nutrition-preview')).toContainText('5');
    await page.getByRole('button', { name: 'Add to Lunch', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    const entry = (await savedEntries(page))[0];
    expect(entry).toMatchObject({ sourceId: 'off-0810128528191', meal: 'Lunch', quantity: Number(amount), unit, grams: null });
    expect(entry.calories).toBeCloseTo(5, 4);
    expect(entry.carbs).toBeCloseTo(1, 4);
    await page.reload();
    await expect(page.locator('.food-row')).toContainText('Energy Drink');
    await expect(page.locator('.food-row')).toContainText(unit === 'serving' ? '0.5 × 16 fl oz' : unit === 'milliliters' ? '236.59 mL' : '8 US fl oz');
    await expect(page.locator('.food-cal')).toHaveText('5');
  });
}

test('invalid and incomplete barcode products leave the diary unchanged', async ({ page, context }) => {
  let lookups = 0;
  await context.route('https://world.openfoodfacts.org/api/v2/product/*', route => {
    lookups += 1;
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { status: 1, product: { code: '810128528191', product_name: 'Incomplete product' } } });
  });
  await openDiary(page);
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  await page.getByRole('button', { name: 'Scan barcode', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Barcode number' });
  await input.fill('123');
  await page.getByRole('button', { name: 'Look up barcode', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('8, 12, 13, or 14 digit');
  expect(lookups).toBe(0);
  await input.fill('810128528191');
  await page.getByRole('button', { name: 'Look up barcode', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('missing nutrition information');
  expect(lookups).toBe(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await openDiary(page);
  await expect(page.locator('.food-row')).toHaveCount(0);
  expect(await savedEntries(page)).toEqual([]);
});
