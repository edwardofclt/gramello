import { test, expect, type Page } from '@playwright/test';
import { productFood } from '../../lib/barcode-food';
import { ghostProduct } from '../../tests/fixtures/ghost-energy';

const product = { id: 'off-3017620422003', name: 'Breakfast oats', brand: 'Test Kitchen', source: 'Open Food Facts', calories: 400, protein: 10, carbs: 60, fat: 10, servingGrams: 40, servingLabel: '1/2 cup (40 g)' };

async function setup(page: Page, camera: boolean | 'pending' | 'blank' = false) {
  const entries: Record<string, unknown>[] = [];
  const codes: string[] = [];
  await page.addInitScript(({ camera }) => {
    // Feed an actual EAN-13 image into the real browser decoder. Only the
    // physical camera is replaced; barcode detection and cleanup stay real.
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      if (!camera) throw new DOMException('Denied by test', 'NotAllowedError');
      document.documentElement.dataset.cameraRequested = 'true';
      if (camera === 'pending') await new Promise<void>(resolve => {
        (window as Window & { releaseCamera?: () => void }).releaseCamera = resolve;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext('2d')!;
      const left = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
      const even = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
      const right = left.map(bits => bits.replace(/[01]/g, bit => bit === '0' ? '1' : '0'));
      const digits = '3017620422003';
      const parity = 'LLGGGL'; // EAN-13 leading digit 3
      let bits = '101';
      for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? left : even)[Number(digits[i])];
      bits += '01010';
      for (let i = 7; i < 13; i++) bits += right[Number(digits[i])];
      bits += '101';
      const paint = () => {
        context.fillStyle = 'white'; context.fillRect(0, 0, 640, 360);
        context.fillStyle = 'black';
        if (camera !== 'blank') for (let i = 0; i < bits.length; i++) if (bits[i] === '1') context.fillRect(130 + i * 4, 60, 4, 240);
      };
      paint();
      const timer = setInterval(paint, 50);
      const stream = canvas.captureStream(20);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); document.documentElement.dataset.cameraStopped = 'true'; };
      }
      return stream;
    } });
  }, { camera });
  await page.route('https://nourish.test/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    expect(request.headers().authorization).toBe('Bearer ui-test-access-token');
    if (url.pathname === '/api/day') return route.fulfill({ json: { goals: { calories: 2000, protein: 150, carbs: 200, fat: 67 }, entries }, headers });
    if (url.pathname === '/api/foods/search') return route.fulfill({ json: { foods: [product] }, headers });
    if (url.pathname === '/api/foods/barcode') {
      codes.push(url.searchParams.get('code')!);
      if (codes.at(-1) === '000000000000') return route.fulfill({ status: 404, json: { error: 'No product found for this barcode. Try another barcode or search by name.' }, headers });
      return route.fulfill({ json: { food: codes.at(-1) === '810128528191' ? productFood(ghostProduct, '810128528191') : product }, headers });
    }
    if (url.pathname === '/api/entries' && request.method() === 'POST') {
      const entry = { id: 'entry-1', ...request.postDataJSON() };
      entries.push(entry);
      return route.fulfill({ status: 201, json: entry, headers });
    }
    return route.fulfill({ json: {}, headers });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in to Gramello' }).click();
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  await page.getByRole('button', { name: 'Scan barcode', exact: true }).click();
  return { entries, codes };
}

for (const width of [390, 1440]) {
  test(`manual barcode entry survives camera denial and preserves the meal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { entries, codes } = await setup(page);
    await expect(page.getByRole('alert')).toContainText('Camera access was denied');
    await page.getByRole('textbox', { name: 'Barcode number' }).fill('0 12345-678905');
    await page.getByRole('button', { name: 'Look up barcode', exact: true }).click();
    await expect(page.getByText('Choose amount', { exact: true })).toBeVisible();
    expect(codes).toEqual(['012345678905']);
    expect(entries).toHaveLength(0);
    await page.getByRole('textbox', { name: 'Servings (1/2 cup (40 g))' }).fill('2');
    await page.getByRole('button', { name: 'Add to lunch', exact: true }).click();
    await expect(page.getByText('Breakfast oats', { exact: true })).toBeVisible();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sourceId: 'off-3017620422003', meal: 'Lunch', quantity: 2, grams: 80, calories: 320, protein: 8, carbs: 48, fat: 8 });
  });
}

test('a live camera barcode opens one product and releases the camera', async ({ page }) => {
  const { entries, codes } = await setup(page, true);
  await expect(page.getByText('Choose amount', { exact: true })).toBeVisible({ timeout: 20000 });
  expect(codes).toEqual(['3017620422003']);
  expect(entries).toHaveLength(0);
  await expect(page.locator('html')).toHaveAttribute('data-camera-stopped', 'true');
});

test('invalid and unknown barcodes can be corrected or replaced with a name search', async ({ page }) => {
  const { codes } = await setup(page);
  await page.getByRole('textbox', { name: 'Barcode number' }).fill('123');
  await page.getByRole('button', { name: 'Look up barcode', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('digit product barcode');
  expect(codes).toHaveLength(0);
  await page.getByRole('textbox', { name: 'Barcode number' }).fill('000000000000');
  await page.getByRole('button', { name: 'Look up barcode', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No product found');
  await page.screenshot({ path: 'test-results/barcode-not-found.png' });
  await page.getByRole('button', { name: 'Search by name' }).click();
  await page.getByRole('textbox', { name: 'Search foods' }).fill('oats');
  await page.getByRole('button', { name: /Breakfast oats/ }).click();
  await expect(page.getByText('Choose amount', { exact: true })).toBeVisible();
});

test('closing while camera permission is pending releases the late stream', async ({ page }) => {
  const { codes } = await setup(page, 'pending');
  await expect(page.locator('html')).toHaveAttribute('data-camera-requested', 'true');
  await page.getByRole('button', { name: 'Close scan barcode', exact: true }).click();
  await expect(page.getByTestId('app-dialog')).toHaveCount(0);
  await page.evaluate(() => (window as Window & { releaseCamera?: () => void }).releaseCamera?.());
  await expect(page.locator('html')).toHaveAttribute('data-camera-stopped', 'true');
  expect(codes).toHaveLength(0);
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search foods' })).toBeVisible();
});

test('manual entry turns off an active camera on a short phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await setup(page, 'blank');
  await expect(page.locator('video')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-camera-requested', 'true');
  await page.screenshot({ path: 'test-results/barcode-camera-phone.png' });
  await page.getByRole('textbox', { name: 'Barcode number' }).fill('3017620422003');
  await expect(page.locator('html')).toHaveAttribute('data-camera-stopped', 'true');
  await page.getByRole('button', { name: 'Look up barcode', exact: true }).click();
  await expect(page.getByText('Choose amount', { exact: true })).toBeVisible();
});

test('returning to search cancels a pending lookup and ignores its late result', async ({ page }) => {
  await setup(page);
  let release: () => void = () => {};
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://nourish.test/api/foods/barcode?*', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization' } });
    await responseGate;
    await route.fulfill({ json: { food: product }, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization' } }).catch(() => {});
  });
  await page.getByRole('textbox', { name: 'Barcode number' }).fill('3017620422003');
  const request = page.waitForRequest(request => request.url().includes('/api/foods/barcode?') && request.method() === 'GET');
  await page.getByRole('button', { name: 'Look up barcode', exact: true }).click();
  await request;
  await expect(page.getByRole('button', { name: 'Looking up barcode…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Search by name' }).click();
  release();
  await expect(page.getByRole('textbox', { name: 'Search foods' })).toBeVisible();
  await expect(page.getByText('Choose amount', { exact: true })).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`logs the Ghost energy drink in servings and volume at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { entries } = await setup(page);
    await page.getByRole('textbox', { name: 'Barcode number' }).fill('810128528191');
    await page.getByRole('button', { name: 'Look up barcode', exact: true }).click();
    await expect(page.getByText('Choose amount', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grams', exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Servings (16 fl oz)' })).toHaveValue('1');
    await page.getByRole('button', { name: 'mL', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Volume in mL' })).toHaveValue('473.176');
    await page.getByRole('button', { name: 'US fl oz', exact: true }).click();
    await page.getByRole('textbox', { name: 'Volume in US fluid ounces' }).fill('8');
    await page.getByRole('button', { name: 'Add to lunch', exact: true }).click();
    await expect(page.getByText('Energy Drink', { exact: true })).toBeVisible();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sourceId: 'off-0810128528191', meal: 'Lunch', quantity: 8, unit: 'fluid-ounces', grams: null });
    expect(entries[0].calories).toBeCloseTo(5, 4);
    expect(entries[0].carbs).toBeCloseTo(1, 4);
    await expect(page.getByText(/8 US fl oz · Open Food Facts/)).toBeVisible();
    await page.screenshot({ path: `test-results/ghost-diary-${width}.png` });
  });
}
