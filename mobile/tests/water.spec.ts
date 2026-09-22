import { test, expect } from '@playwright/test';
import type { WaterEntry, WaterGoal } from '../../lib/water';

for (const width of [390, 1440]) {
  test(`water tracking and goal editing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let goal: WaterGoal = { goalMl: 2000, unit: 'ml' };
    let entries: WaterEntry[] = [];
    let failSave = true;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://gramello.test/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      expect(request.headers().authorization).toBe('Bearer ui-test-access-token');
      if (url.pathname === '/api/day') return route.fulfill({ headers, json: { goals: { calories: 2400, protein: 180, carbs: 250, fat: 70 }, entries: [] } });
      if (url.pathname === '/api/water/goals') {
        goal = request.postDataJSON();
        return route.fulfill({ headers, json: goal });
      }
      if (url.pathname === '/api/water') {
        if (request.method() === 'POST') {
          if (failSave) { failSave = false; return route.fulfill({ headers, status: 503, json: { error: 'Water save failed. Try again.' } }); }
          const entry = { id: `water-${entries.length}`, createdAt: new Date().toISOString(), ...request.postDataJSON() };
          entries.push(entry);
          return route.fulfill({ headers, status: 201, json: entry });
        }
        if (request.method() === 'DELETE') {
          entries = entries.filter(entry => entry.id !== url.searchParams.get('id'));
          return route.fulfill({ headers, json: { ok: true } });
        }
        const date = url.searchParams.get('date');
        const selected = entries.filter(entry => entry.date === date);
        return route.fulfill({ headers, json: { date, goal, entries: selected, totalMl: selected.reduce((sum, entry) => sum + entry.amountMl, 0) } });
      }
      return route.fulfill({ headers, json: {} });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in to Gramello' }).click();
    const total = page.getByTestId('water-total');
    await expect(total).toHaveText('0 mL of 2000 mL');
    await page.getByRole('textbox', { name: 'Custom water amount (mL)' }).fill('375');
    await page.getByRole('button', { name: 'Add water', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Water save failed');
    await expect(page.getByRole('textbox', { name: 'Custom water amount (mL)' })).toHaveValue('375');
    await expect(total).toHaveText('0 mL of 2000 mL');
    await page.getByRole('button', { name: 'Add water', exact: true }).click();
    await expect(total).toHaveText('375 mL of 2000 mL');
    await page.getByRole('button', { name: '+ 250 mL', exact: true }).click();
    await expect(total).toHaveText('625 mL of 2000 mL');
    await page.getByRole('button', { name: 'Edit water goal', exact: true }).click();
    await page.getByRole('button', { name: 'Use US fl oz', exact: true }).click();
    await page.getByRole('textbox', { name: 'Daily water goal (US fl oz)' }).fill('64');
    await page.getByRole('button', { name: 'Save water goal', exact: true }).click();
    await expect(page.getByTestId('app-dialog')).toHaveCount(0);
    await expect(total).toHaveText('21.1 US fl oz of 64 US fl oz');
    expect(goal.goalMl).toBeCloseTo(1892.705892, 6);
    await page.getByRole('button', { name: 'Previous day', exact: true }).click();
    await expect(total).toHaveText('0 US fl oz of 64 US fl oz');
    await page.getByRole('button', { name: '+ 16 US fl oz', exact: true }).click();
    await expect(total).toHaveText('16 US fl oz of 64 US fl oz');
    await page.getByRole('button', { name: 'Show water entries (1)' }).click();
    await page.getByRole('button', { name: 'Remove 16 US fl oz water' }).click();
    await expect(total).toHaveText('0 US fl oz of 64 US fl oz');
    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    await expect(total).toHaveText('21.1 US fl oz of 64 US fl oz');
    await total.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/native-water-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
