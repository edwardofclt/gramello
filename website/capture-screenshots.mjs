// Capture the real responsive web app with an isolated, synthetic local diary.
// Start `pnpm dev`, then run `node website/capture-screenshots.mjs`.
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

// Reuse the image encoder already pinned by Wrangler/Miniflare.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const sharp = createRequire(wranglerRequire.resolve('miniflare/package.json'))('sharp');
const baseURL = process.env.SCREENSHOT_APP_URL || 'http://localhost:5173';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('Run the capture against a local app preview.');
}
const output = new URL('./assets/screenshots/', import.meta.url);
// Workers use their own clock; keep sample dates aligned with their current day
// so a later refresh still has a populated seven-day trend range.
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const now = `${day}T16:00:00.000Z`;
const nutrients = ['calories', 'protein', 'carbs', 'fat'];
const food = (id, name, servingGrams, calories, protein, carbs, fat) => ({
  id, name, source: 'My foods', sourceKind: 'custom', verified: false,
  servingGrams, servingLabel: '1 serving', nutritionBasis: 'serving',
  calories, protein, carbs, fat,
});
const yogurt = food('sample-yogurt', 'Greek yogurt', 170, 100, 17, 6, 0);
const oats = food('sample-oats', 'Rolled oats', 40, 150, 5, 27, 3);
const berries = food('sample-berries', 'Blueberries', 100, 57, 0.7, 14.5, 0.3);
const chicken = food('sample-chicken', 'Grilled chicken', 150, 248, 46.5, 0, 5.4);
const quinoa = food('sample-quinoa', 'Cooked quinoa', 150, 180, 6.6, 32, 2.9);
const avocado = food('sample-avocado', 'Avocado', 100, 160, 2, 8.5, 14.7);
const foods = [yogurt, oats, berries, chicken, quinoa, avocado];
const recipe = (id, name, ingredients) => {
  const totalGrams = ingredients.reduce((sum, item) => sum + item.servingGrams, 0);
  return { kind: 'meal', id, date: null, value: {
    id, name, updatedAt: now, totalGrams, servingGrams: totalGrams,
    ingredients: ingredients.map(item => ({ food: item, quantity: 1, unit: 'serving' })),
  } };
};
const records = [
  ...foods.map(value => ({ kind: 'food', id: value.id, date: null, value })),
  { kind: 'goals', id: 'default', date: null, value: { calories: 2000, protein: 150, carbs: 200, fat: 67 } },
  { kind: 'waterGoal', id: 'default', date: null, value: { goalMl: 2000, unit: 'ml' } },
  { kind: 'water', id: 'sample-water', date: day, value: { id: 'sample-water', date: day, amountMl: 1250, createdAt: now } },
  recipe('sample-breakfast', 'The weekday breakfast', [oats, yogurt, berries]),
  recipe('sample-lunch', 'Chicken & quinoa bowl', [chicken, quinoa, avocado]),
  recipe('sample-snack', 'Yogurt & blueberries', [yogurt, berries]),
];
const meals = [
  ['Breakfast', 'Greek yogurt, oats & berries', 307, 22.7, 47.5, 3.3, 310],
  ['Lunch', 'Chicken & quinoa bowl', 588, 55.1, 40.5, 23, 400],
  ['Dinner', 'Salmon, rice & greens', 557, 36, 57, 20.5, 400],
];
for (const [index, target] of [1820, 2020, 1760, 2080, 1910, 1870, 1452].entries()) {
  const date = new Date(Date.parse(now) - (6 - index) * 86400000).toISOString().slice(0, 10);
  for (const [meal, name, calories, protein, carbs, fat, grams] of meals) {
    const id = `sample-${date}-${meal.toLowerCase()}`;
    const factor = target / 1452;
    const scaled = Object.fromEntries(nutrients.map((key, i) => [key, [calories, protein, carbs, fat][i] * factor]));
    records.push({ kind: 'entry', id, date, value: {
      id, date, createdAt: `${date}T12:00:00.000Z`, meal, name, source: 'My foods',
      quantity: factor, unit: 'serving', grams: grams * factor, servingLabel: '1 bowl', verified: false, ...scaled,
    } });
  }
}
const archive = { format: 'gramello', version: 1, exportedAt: now, records };

await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'America/New_York',
    colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  // This fresh context has no real user records. Skip legacy hosted migration;
  // all displayed sample records are imported into the production SQLite worker.
  await context.route('**/api/backup', route => route.fulfill({ json: { ...archive, records: [] } }));
  await context.route('https://**', route => route.abort());
  // Vite adds Content-Encoding:gzip to .gz files, causing browsers to decode
  // them before the worker's DecompressionStream. Serve the same generated
  // asset as raw gzip bytes, matching the production static-asset response.
  await context.route('**/offline/catalog.sqlite.gz', route => route.fulfill({
    path: fileURLToPath(new URL('../public/offline/catalog.sqlite.gz', import.meta.url)),
    contentType: 'application/gzip',
  }));
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.clock.setFixedTime(new Date(now));
  await page.goto(baseURL);
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.evaluate(text => new Promise((resolve, reject) => {
    const worker = new Worker('/offline/diary-worker.js', { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Sample import timed out')); }, 30000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onerror = event => { finish(); reject(new Error(event.message)); };
    worker.onmessage = ({ data }) => {
      if (data.id !== 1) return;
      finish();
      if (data.error) reject(new Error(data.error)); else resolve(data.value);
    };
    worker.postMessage({ id: 1, method: 'importArchive', args: [text] });
  }), JSON.stringify(archive));
  await page.reload();
  await expect(page.locator('.calorie-focus h2')).toContainText('1,452');
  await expect(page.locator('.water-total')).toContainText('1250 mL');

  async function capture(name) {
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    const png = await page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' });
    await sharp(png).webp({ lossless: true }).toFile(fileURLToPath(new URL(`${name}.webp`, output)));
    console.log(`Captured ${name}: 390 × 844 CSS pixels, 780 × 1688 image pixels`);
  }
  await capture('diary');
  await page.getByRole('button', { name: 'Add food', exact: true }).click();
  // Custom-food searches finish locally without a delayed online expansion.
  await page.getByRole('button', { name: 'My foods', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search foods', exact: true }).fill('avocado');
  await expect(page.locator('.result-row').first()).toBeVisible();
  await expect(page.getByText('Finding more matches…', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Some nutrition databases are unavailable.' })).toBeHidden();
  await page.getByRole('textbox', { name: 'Search foods', exact: true }).blur();
  await capture('search');
  await page.locator('.result-row').filter({ has: page.getByText('Avocado', { exact: true }) }).click();
  await page.getByLabel('Measure', { exact: true }).selectOption('grams');
  await page.getByRole('spinbutton').fill('150');
  await page.getByRole('spinbutton').blur();
  await capture('portion');
  await page.getByRole('button', { name: 'My meals', exact: true }).click();
  await expect(page.locator('.saved-meal-choice')).toHaveCount(3);
  await capture('meals');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Trends', exact: true }).filter({ visible: true }).click();
  await page.getByRole('tab', { name: '7 days', exact: true }).click();
  await expect(page.locator('.chart-wrap svg').first()).toBeVisible();
  await expect(page.getByText('Loading trends…', { exact: true })).toBeHidden();
  // Scroll the actual mobile viewport to the summary and complete calorie chart.
  await page.locator('.stat-grid').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0,
    document.querySelector('.stat-grid').getBoundingClientRect().top + window.scrollY
      - document.querySelector('.topbar').getBoundingClientRect().height - 24));
  await capture('trends');
} finally {
  await browser.close();
}
