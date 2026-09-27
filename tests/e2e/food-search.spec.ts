import { test, expect, localDiary, openDiary, savedEntries, seedDiary } from './fixtures';
import type { Food } from '../../lib/food';
import type { FoodSearchResult } from '../../lib/food-search';

const custom = (id: string, name: string): Food => ({ id, name, source: 'Custom food', sourceKind: 'custom', verified: false, nutritionBasis: '100g', servingGrams: 100, servingLabel: '100 g', calories: 200, protein: 10, carbs: 30, fat: 5 });

test('browser-local catalog ranks staples, forwards filters and retains practical servings', async ({ page }) => {
  await openDiary(page);
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Search foods', exact: true });
  await input.fill('egg');
  await expect(page.locator('.result-row').first()).toContainText('Egg, whole, raw, fresh');
  await expect(page.locator('.result-row').first()).toContainText('1 large (50 g)');
  await page.getByRole('button', { name: 'Restaurants', exact: true }).click();
  await expect(page.locator('.result-row').first()).toBeVisible();
  await expect(page.locator('.search-results')).not.toContainText('USDA FoodData Central');
  await page.getByRole('button', { name: 'Generic', exact: true }).click();
  await expect(page.locator('.result-row').first()).toContainText('Egg, whole, raw, fresh');
  await page.locator('.result-row').first().click();
  await expect(page.locator('.nutrition-preview')).toContainText('72');
  await page.getByRole('button', { name: 'Add to Lunch', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const entries = await savedEntries(page);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ sourceId: 'usda-171287', grams: 50, calories: 71.5, meal: 'Lunch' });
  await page.reload();
  await expect(page.locator('.food-row')).toContainText('Egg, whole, raw, fresh');
});

test('typing shows local matches while automatic online results are checked and cached', async ({ page, context }) => {
  let calls = 0;
  let releaseProvider!: () => void;
  const providerGate = new Promise<void>(resolve => { releaseProvider = resolve; });
  await context.route('https://world.openfoodfacts.org/cgi/search.pl?*', async route => {
    calls++;
    await providerGate;
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { count: 1, page: 1, page_size: 100, products: [{
      code: '0012345678905', product_name: 'Searchtest oats cereal', brands: 'Searchtest',
      serving_quantity: 40, serving_quantity_unit: 'g', serving_size: '40 g',
      nutriments: { 'energy-kcal_100g': 300, proteins_100g: 10, carbohydrates_100g: 50, fat_100g: 6 },
    }] } });
  });
  await seedDiary(page, [custom('custom-searchtest-oats', 'Searchtest oats bowl')]);
  await page.getByRole('button', { name: 'Add Breakfast', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods', exact: true }).fill('Searchtest oats');
  await expect(page.getByRole('button', { name: /Searchtest oats bowl/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search online', exact: true })).toHaveCount(0);
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole('button', { name: /Searchtest oats bowl/ })).toBeEnabled();
  await expect(page.getByText(/Finding more matches/)).toBeVisible();
  releaseProvider();
  const product = page.getByRole('button', { name: /Searchtest oats cereal/ });
  await expect(product).toBeVisible();
  await expect(page.getByRole('button', { name: /Searchtest oats bowl/ })).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Packaged', exact: true }).click();
  await expect(product).toBeVisible();
  await expect(page.getByRole('button', { name: /Searchtest oats bowl/ })).toHaveCount(0);
  await page.getByLabel('Brand or restaurant', { exact: true }).selectOption('Searchtest');
  await expect(product).toBeVisible();
  await product.click();
  await page.getByRole('button', { name: 'Add to Breakfast', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await savedEntries(page))[0]).toMatchObject({ sourceId: 'off-0012345678905', grams: 40, calories: 120 });
  const cached = await localDiary<FoodSearchResult>(page, 'searchFoods', ['Searchtest oats', { online: false, category: 'packaged', brand: 'Searchtest', limit: 20 }]);
  expect(cached.foods.map(food => food.id)).toEqual(['off-0012345678905']);
  expect(calls).toBe(1);
});

test('reviewed catalog variants stay expanded after choosing a serving and going Back', async ({ page }) => {
  await openDiary(page);
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods', exact: true }).fill('cookout cheerwine');
  const group = page.locator('details.search-variants').filter({ hasText: 'Cheerwine' });
  await group.locator('summary').click();
  await group.getByRole('button', { name: /Cheerwine Large/ }).click();
  await expect(page.getByText('Choose amount', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to results', exact: true }).click();
  await expect(group).toHaveAttribute('open', '');
  await expect(group.getByRole('button', { name: /Cheerwine Large/ })).toBeVisible();
});

test('real worker continuation appends unique foods and Back restores deep scroll', async ({ page }) => {
  const foods = Array.from({ length: 40 }, (_, index) => custom(`custom-scroll-${index}`, `Scrollfixture item ${String(index + 1).padStart(2, '0')}`));
  await seedDiary(page, foods);
  await page.getByRole('button', { name: 'Add Dinner', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Search foods', exact: true });
  await input.fill('Scrollfixture');
  await page.getByRole('button', { name: 'My foods', exact: true }).click();
  await expect(page.locator('.result-row')).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.result-row')).toHaveCount(40);
  expect(new Set(await page.locator('.result-row strong').allTextContents()).size).toBe(40);
  const row = page.getByRole('button', { name: /Scrollfixture item 32/ });
  await row.scrollIntoViewIfNeeded();
  const offset = await page.locator('.food-dialog').evaluate(element => element.scrollTop);
  expect(offset).toBeGreaterThan(500);
  await row.click();
  await page.getByRole('button', { name: 'Back to results', exact: true }).click();
  await expect(input).toHaveValue('Scrollfixture');
  await expect(page.locator('.result-row')).toHaveCount(40);
  await expect.poll(async () => Math.abs(await page.locator('.food-dialog').evaluate(element => element.scrollTop) - offset)).toBeLessThan(4);
});

test('loading more after a provider failure uses available foods without retrying the provider', async ({ page, context }) => {
  let providerCalls = 0;
  await context.route('https://world.openfoodfacts.org/cgi/search.pl?*', route => {
    providerCalls++;
    return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, json: { error: 'Unavailable' } });
  });
  await seedDiary(page, Array.from({ length: 24 }, (_, index) => custom(`custom-paging-${index}`, `Pagingfixture item ${String(index).padStart(2, '0')}`)));
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods', exact: true }).fill('Pagingfixture');
  await expect(page.locator('.result-row')).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Some nutrition databases are unavailable.', exact: true })).toBeVisible();
  expect(providerCalls).toBe(1);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.result-row')).toHaveCount(24);
  expect(providerCalls).toBe(1);
});
