import { test, expect } from '@playwright/test';
import type { CustomMeal } from '../../lib/meals';

for (const width of [390, 1440]) {
  test(`creates a soup and logs a 16 oz portion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const entries: Record<string, unknown>[] = [];
    let meals: CustomMeal[] = [];
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/day') return route.fulfill({ json: { goals: { calories: 2400, protein: 180, carbs: 250, fat: 70 }, entries } });
      if (path === '/api/foods/search') return route.fulfill({ json: { foods: ['Beef', 'Tomatoes'].map(name => ({ id: name, name, source: 'Test fixture', calories: 200, protein: 20, carbs: 10, fat: 5, servingGrams: 100, servingLabel: '100 g' })) } });
      if (path === '/api/meals') {
        if (request.method() === 'POST') {
          const draft = request.postDataJSON();
          expect(draft.totalGrams).toBeCloseTo(1814.36948, 8);
          expect(draft.servingGrams).toBeCloseTo(453.59237, 8);
          expect(draft.ingredients).toHaveLength(2);
          const meal = { ...draft, id: 'my-soup', updatedAt: 'today' };
          meals = [meal];
          return route.fulfill({ status: 201, json: { meal } });
        }
        return route.fulfill({ json: { meals } });
      }
      if (path === '/api/entries' && request.method() === 'POST') {
        const entry = { id: 'entry-1', ...request.postDataJSON() };
        entries.push(entry);
        return route.fulfill({ status: 201, json: entry });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
    await page.getByRole('button', { name: 'My meals', exact: true }).click();
    await page.getByRole('button', { name: 'Create meal', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save meal', exact: true })).toBeDisabled();
    await page.getByRole('textbox', { name: 'Meal name' }).fill('Homemade soup');
    for (const [name, quantity] of [['Beef', '400'], ['Tomatoes', '200']]) {
      await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
      await page.getByRole('textbox', { name: 'Search foods', exact: true }).fill(name);
      await page.getByRole('button', { name: new RegExp(`${name} Test fixture`) }).click();
      await page.getByRole('button', { name: 'Grams', exact: true }).click();
      await page.getByRole('textbox', { name: 'Weight in grams' }).fill(quantity);
      await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
    }
    const beefAmount = page.getByRole('textbox', { name: 'Amount of Beef', exact: true });
    await beefAmount.fill('');
    await beefAmount.pressSequentially('0.5');
    await expect(beefAmount).toHaveValue('0.5');
    await beefAmount.fill('400');
    await page.getByRole('button', { name: 'Batch weight in ounces' }).click();
    await page.getByRole('textbox', { name: 'Finished batch weight (optional)' }).fill('64');
    await page.getByRole('button', { name: 'Ounces per portion', exact: true }).click();
    await page.getByRole('textbox', { name: 'Ounces per portion', exact: true }).fill('16');
    await expect(page.getByText('Whole batch · 1200 kcal', { exact: true })).toBeVisible();
    await expect(page.getByText(/Makes 4 portions of/)).toBeVisible();
    await page.getByRole('button', { name: 'Save meal', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/native-meal-${width}.png` });
    await page.getByRole('button', { name: 'Save meal', exact: true }).click();
    await page.getByRole('button', { name: 'Close my meals', exact: true }).click();
    await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
    await page.getByRole('button', { name: 'My meals', exact: true }).click();
    await page.getByRole('button', { name: 'Choose Homemade soup', exact: true }).click();
    await page.getByRole('button', { name: 'Ounces', exact: true }).click();
    await page.getByRole('textbox', { name: 'Weight in ounces' }).fill('16');
    await page.getByRole('button', { name: 'Add to lunch', exact: true }).click();
    await expect(page.getByText('Homemade soup', { exact: true })).toBeVisible();
    expect(entries).toHaveLength(1);
    expect(entries[0].calories).toBeCloseTo(300, 8);
    expect(entries[0]).toMatchObject({ source: 'My meals', meal: 'Lunch', unit: 'ounces', quantity: 16, protein: 30, carbs: 15, fat: 7.5 });
    expect(errors).toEqual([]);
  });
}

test('a custom ingredient without a weight can be saved in a meal after weighing the batch', async ({ page }) => {
  let savedMeal: CustomMeal | undefined;
  const entries: Record<string, unknown>[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/day') return route.fulfill({ json: { goals: { calories: 2400, protein: 180, carbs: 250, fat: 70 }, entries } });
    if (path === '/api/foods/custom') return route.fulfill({ status: 201, json: { food: { ...request.postDataJSON(), id: 'custom-sauce', source: 'Community submitted', sourceKind: 'custom', verified: false, nutritionBasis: 'serving' } } });
    if (path === '/api/meals') {
      if (request.method() === 'POST') {
        savedMeal = { ...request.postDataJSON(), id: 'custom-meal', updatedAt: 'today' };
        return route.fulfill({ status: 201, json: { meal: savedMeal } });
      }
      return route.fulfill({ json: { meals: savedMeal ? [savedMeal] : [] } });
    }
    if (path === '/api/entries') {
      entries.push({ ...request.postDataJSON(), id: 'entry-custom-meal' });
      return route.fulfill({ status: 201, json: entries[0] });
    }
    return route.fulfill({ json: { foods: [] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Dinner', exact: true }).click();
  await page.getByRole('button', { name: 'My meals', exact: true }).click();
  await page.getByRole('button', { name: 'Create meal', exact: true }).click();
  await page.getByRole('textbox', { name: 'Meal name' }).fill('Shared sauce meal');
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
  await page.getByRole('button', { name: 'Add custom food', exact: true }).click();
  for (const [name, value] of [['Food name', 'Custom sauce'], ['Serving description', '1 jar'], ['Calories (kcal)', '600'], ['Protein (g)', '30'], ['Carbs (g)', '60'], ['Fat (g)', '20']]) {
    await page.getByRole('textbox', { name, exact: true }).fill(value);
  }
  await page.getByRole('button', { name: 'Save custom food', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Grams', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save meal', exact: true })).toBeDisabled();
  await expect(page.getByText(/Enter the finished batch weight when an ingredient/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Finished batch weight (required)', exact: true }).fill('400');
  await page.getByRole('textbox', { name: 'Number of servings', exact: true }).fill('2');
  await expect(page.getByText('Whole batch · 600 kcal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save meal', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Shared sauce meal', exact: true }).click();
  await page.getByRole('button', { name: 'Add to dinner', exact: true }).click();
  expect(savedMeal).toMatchObject({ totalGrams: 400, servingGrams: 200, ingredients: [{ food: { id: 'custom-sauce', nutritionBasis: 'serving', servingGrams: null, verified: false }, quantity: 1, unit: 'serving' }] });
  expect(entries[0]).toMatchObject({ grams: 200, calories: 300, protein: 15, carbs: 30, fat: 10, source: 'My meals' });
});
