import { expect, type Page } from '@playwright/test';
import type { Food } from '../lib/food';
const food = (id: string, name: string, extra: Partial<Food> = {}): Food => ({ id, name, source: 'USDA reference', verified: true, nutritionBasis: '100g', servingGrams: 100, servingLabel: '100 g', calories: 200, protein: 20, carbs: 0, fat: 8, ...extra });
const raw = food('raw', 'Chicken breast, raw');
const cooked = food('cooked', 'Chicken breast, roasted');
const bowl = food('restaurant-test', 'Chicken bowl, large', { brand: 'Test Kitchen', source: 'Official menu', sourceKind: 'restaurant', nutritionBasis: 'serving', servingGrams: null, servingLabel: '1 large bowl', calories: 650 });

export async function searchWorkflow(page: Page, mobile: boolean) {
  const requests: URL[] = []; let onlineFails = true; let releaseOnline!: () => void;
  const onlineGate = new Promise<void>(resolve => { releaseOnline = resolve; });
  await page.route('**/api/foods/search?*', async route => {
    const url = new URL(route.request().url()); requests.push(url); const params = url.searchParams;
    if (params.get('online') === '1' && onlineFails) { await onlineGate; return route.fulfill({ status: 503, json: { error: 'Offline' } }); }
    if (params.get('category') === 'packaged') return route.fulfill({ json: { foods: [] } });
    if (params.get('category') === 'restaurant') return route.fulfill({ json: { foods: [bowl], hits: [{ food: bowl, category: 'restaurant' }], brands: ['Test Kitchen'] } });
    if (params.get('window') === '200') return route.fulfill({ json: { foods: [bowl], hits: [{ food: bowl, category: 'restaurant', warning: 'Preparation details were not provided.' }], correction: 'chicken', sourceStatus: [{ source: 'Open Food Facts', state: 'ready', message: 'Online search shows up to 200 matches from this provider. Use a more specific name to narrow the results.' }] } });
    if (params.has('cursor')) return route.fulfill({ json: { foods: [cooked, bowl], canExpand: true } });
    return route.fulfill({ json: { foods: [raw, cooked], hits: [{ food: raw, category: 'generic' }, { food: cooked, category: 'generic' }], nextCursor: 'second-page' } });
  });
  if (mobile) {
    await page.route('**/api/day*', route => route.fulfill({ json: { goals: { calories: 2400, protein: 180, carbs: 250, fat: 70 }, entries: [] } }));
    await page.route('**/api/water?*', route => route.fulfill({ json: { date: new URL(route.request().url()).searchParams.get('date'), totalMl: 0, entries: [], goal: { goalMl: 2000, unit: 'ml' } } }));
  }
  await page.goto('/'); await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Search foods', exact: true }); await input.fill('chicken');
  const rawRow = page.getByRole('button', { name: /Chicken breast, raw/ }); const cookedRow = page.getByRole('button', { name: /Chicken breast, roasted/ });
  await expect(rawRow).toBeVisible(); await expect(cookedRow).toBeVisible(); await expect(rawRow).toContainText('Serving: 100 g'); await expect(rawRow).toContainText('per 100 g');
  expect(requests[0].searchParams.get('online')).toBe('0'); expect(requests[0].searchParams.get('limit')).toBe('20');
  await expect(page.getByRole('button', { name: 'Search online', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Finding more matches/)).toBeVisible(); await expect(rawRow).toBeEnabled(); expect(requests.at(-1)?.searchParams.get('online')).toBe('1');
  releaseOnline(); await expect(page.getByRole('alert').filter({ hasText: 'available matches' })).toContainText('available matches'); await expect(rawRow).toBeVisible(); onlineFails = false;
  const requestsBeforeSelection = requests.length;
  await rawRow.click(); await page.getByRole('button', { name: 'Back to results', exact: true }).click(); await expect(input).toHaveValue('chicken'); await expect(rawRow).toBeVisible(); expect(requests).toHaveLength(requestsBeforeSelection);
  await page.getByRole('button', { name: 'Load more', exact: true }).click(); await expect(page.getByRole('button', { name: /Chicken bowl, large/ })).toBeVisible(); await expect(rawRow).toBeVisible(); await expect(cookedRow).toHaveCount(1);
  await page.getByRole('button', { name: 'Find more matches', exact: true }).click(); await expect(rawRow).toHaveCount(0); await expect(page.getByRole('button', { name: /Chicken bowl, large/ })).toContainText('per 1 large bowl'); await expect(page.getByText('Preparation details were not provided.')).toBeVisible(); await expect(page.getByText(/Open Food Facts: Online search shows up to 200 matches/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Use this spelling', exact: true })).toBeVisible(); expect(requests.at(-1)?.searchParams.get('window')).toBe('200');
  await page.getByRole('button', { name: 'Packaged', exact: true }).click(); await expect(page.getByText('No matches with these filters', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Clear filters', exact: true }).click(); await expect(rawRow).toBeVisible();
  await page.getByRole('button', { name: 'Restaurants', exact: true }).click(); const restaurant = page.getByRole('button', { name: /Chicken bowl, large/ }); await expect(restaurant).toBeVisible();
  if (mobile) await page.getByRole('button', { name: 'Test Kitchen', exact: true }).click(); else await page.getByLabel('Brand or restaurant', { exact: true }).selectOption('Test Kitchen');
  await expect.poll(() => requests.at(-1)?.searchParams.get('brand')).toBe('Test Kitchen'); await expect(restaurant).toBeVisible();
}

export async function trustworthyVariants(page: Page, mobile: boolean) {
  const small = food('small', 'Cola, 250 mL', { brand: 'Fixture', sourceKind: 'database', nutritionBasis: '100ml', nutritionUnit: 'ml', servingMl: 250, servingLabel: '250 mL' });
  const large = { ...small, id: 'large', name: 'Cola, 500 mL', servingMl: 500, servingLabel: '500 mL' };
  await page.route('**/api/foods/search?*', route => route.fulfill({ json: { foods: [small, large], hits: [small, large].map(food => ({ food, category: 'packaged', groupKey: 'fixture-cola', groupLabel: 'Fixture Cola' })) } }));
  if (mobile) {
    await page.route('**/api/day*', route => route.fulfill({ json: { goals: { calories: 2400, protein: 180, carbs: 250, fat: 70 }, entries: [] } }));
    await page.route('**/api/water?*', route => route.fulfill({ json: { date: new URL(route.request().url()).searchParams.get('date'), totalMl: 0, entries: [], goal: { goalMl: 2000, unit: 'ml' } } }));
  }
  let reviewed: unknown;
  await page.route('**/api/entries', route => { reviewed = route.request().postDataJSON().foodRevision; return route.fulfill({ status: 409, json: { error: 'This food changed after you selected it. Return to results and review the updated food before adding it.' } }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Add Lunch', exact: true }).click(); await page.getByRole('textbox', { name: 'Search foods' }).fill('cola');
  if (mobile) await page.getByRole('button', { name: /Fixture Cola · 2 variants/ }).click(); else await page.locator('summary').filter({ hasText: 'Fixture Cola' }).click();
  await expect(page.getByRole('button', { name: /Cola, 250 mL/ })).toContainText('Serving: 250 mL'); await page.getByRole('button', { name: /Cola, 500 mL/ }).click(); await expect(page.getByText(/Fixture · 500 mL/)).toBeVisible();
  await page.getByRole('button', { name: 'Back to results', exact: true }).click();
  await expect(page.getByRole('button', { name: /Cola, 250 mL/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Cola, 500 mL/ })).toBeVisible();
  await page.getByRole('button', { name: /Cola, 500 mL/ }).click();
  await page.getByRole('button', { name: mobile ? 'Add to lunch' : 'Add to Lunch', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'This food changed' })).toBeVisible(); expect(typeof reviewed).toBe('string');
  await page.getByRole('button', { name: 'Back and refresh results', exact: true }).click();
  await expect(page.getByText(/Fixture Cola · 2 variants/)).toBeVisible();
}

export async function deepSearchScroll(page: Page, mobile: boolean) {
  const foods = Array.from({ length: 40 }, (_, index) => ({ id: `scroll-${index}`, name: `Scroll oats ${String(index).padStart(2, '0')}`, source: 'USDA reference', servingLabel: '100 g', servingGrams: 100, calories: 200, protein: 10, carbs: 30, fat: 5 }));
  let requests = 0;
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/day') return route.fulfill({ json: { goals: { calories: 2400, protein: 180, carbs: 250, fat: 70 }, entries: [] } });
    if (url.pathname === '/api/water') return route.fulfill({ json: { date: url.searchParams.get('date'), totalMl: 0, entries: [], goal: { goalMl: 2000, unit: 'ml' } } });
    if (url.pathname === '/api/foods/search') { requests++; return route.fulfill({ json: url.searchParams.has('cursor') ? { foods: foods.slice(20) } : { foods: foods.slice(0, 20), nextCursor: 'page2' } }); }
    return route.fulfill({ json: {} });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  // Keep this pagination/scroll regression independent of provider completion.
  await page.getByRole('button', { name: /^(My foods|Community foods)$/ }).click();
  await page.getByRole('textbox', { name: 'Search foods' }).fill('oats');
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  const target = page.getByRole('button', { name: /Scroll oats 32/ });
  await target.scrollIntoViewIfNeeded();
  const position = () => (mobile ? page.getByTestId('app-dialog') : page.getByRole('dialog')).evaluate(dialog => {
    if (dialog.scrollHeight > dialog.clientHeight + 100 && getComputedStyle(dialog).overflowY === 'auto') return dialog.scrollTop;
    const scroll = Array.from(dialog.querySelectorAll<HTMLElement>('div')).find(element => getComputedStyle(element).overflowY === 'auto' && element.scrollHeight > element.clientHeight + 100);
    return scroll?.scrollTop ?? 0;
  });
  const before = await position(); expect(before).toBeGreaterThan(mobile ? 2000 : 1000);
  await target.click(); await page.getByRole('button', { name: 'Back to results', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search foods' })).toHaveValue('oats');
  await expect(page.getByRole('button', { name: /Scroll oats/ })).toHaveCount(40);
  await expect.poll(async () => Math.abs((await position()) - before)).toBeLessThan(3);
  await expect(target).toBeInViewport(); expect(requests).toBe(2);
}
