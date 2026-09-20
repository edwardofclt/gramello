import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeBarcode } from '../lib/barcode';
import { lookupBarcode } from '../lib/barcode-food';

afterEach(() => vi.unstubAllGlobals());

describe('barcode input', () => {
  it.each([
    ['0 12345-678905', '012345678905'],
    ['3017620422003', '3017620422003'],
    ['96385074', '96385074'],
    ['10012345678902', '10012345678902'],
    ['https://example.com/012345678905', null],
    ['123456789', null],
    ['', null],
  ])('normalizes %s without losing leading zeros', (input, expected) => {
    expect(normalizeBarcode(input)).toBe(expected);
  });
});

const product = {
  code: '012345678905', product_name: 'Breakfast oats', brands: 'Test Kitchen,Other',
  nutriments: { 'energy-kcal_100g': 400, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 10 },
  serving_quantity: 40, serving_size: '1/2 cup (40 g)', serving_quantity_unit: 'g',
};

function provider(data: unknown, status = 200) {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(data, { status }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('product lookup', () => {
  it('looks up the exact code and returns per-100g nutrition with the serving weight', async () => {
    const fetcher = provider({ status: 1, product });
    const result = await lookupBarcode('0 12345-678905');
    expect(result).toMatchObject({ status: 200, food: {
      id: 'off-012345678905', name: 'Breakfast oats', brand: 'Test Kitchen', source: 'Open Food Facts',
      calories: 400, protein: 10, carbs: 60, fat: 10, servingGrams: 40, servingLabel: '1/2 cup (40 g)',
    } });
    expect(String(fetcher.mock.calls[0][0])).toContain('/api/v2/product/012345678905?');
  });

  it('rejects malformed barcodes before contacting the provider', async () => {
    const fetcher = provider({ status: 1, product });
    expect(await lookupBarcode('../secret')).toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([200, 404])('reports unknown products for provider HTTP %s', async status => {
    provider({ status: 0, status_verbose: 'product not found' }, status);
    expect(await lookupBarcode('012345678905')).toMatchObject({ status: 404 });
  });

  it('keeps genuine zero-calorie products', async () => {
    provider({ status: 1, product: { ...product, nutriments: {
      'energy-kcal_100g': 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0,
    } } });
    expect(await lookupBarcode('012345678905')).toMatchObject({ status: 200, food: { calories: 0 } });
  });

  it.each([undefined, null, '', '  ', -1, 'unknown'])('does not invent missing or invalid nutrition (%s)', async value => {
    provider({ status: 1, product: { ...product, nutriments: { ...product.nutriments, proteins_100g: value } } });
    expect(await lookupBarcode('012345678905')).toMatchObject({ status: 422 });
  });

  it('converts kilojoules to kcal when kcal is absent', async () => {
    provider({ status: 1, product: { ...product, nutriments: { ...product.nutriments, 'energy-kcal_100g': undefined, energy_100g: 1673.6 } } });
    const result = await lookupBarcode('012345678905');
    expect(result.status).toBe(200);
    expect('food' in result && result.food.calories).toBeCloseTo(400);
  });

  it('uses a clear 100g serving when serving weight is unavailable', async () => {
    provider({ status: 1, product: { ...product, serving_quantity: undefined, serving_size: '1 bowl', serving_quantity_unit: undefined } });
    expect(await lookupBarcode('012345678905')).toMatchObject({ status: 200, food: { servingGrams: 100, servingLabel: '100 g' } });
  });

  it('does not silently treat millilitres as grams', async () => {
    provider({ status: 1, product: { ...product, nutrition_data_per: '100ml', serving_quantity: 250, serving_quantity_unit: 'ml', serving_size: '250 ml' } });
    expect(await lookupBarcode('012345678905')).toMatchObject({ status: 422 });
  });

  it('detects volume from the package when OFF uses 100g fields for a liquid', async () => {
    const fetcher = provider({ status: 1, product: {
      code: '8410660098804', product_name: 'Extra Virgin Olive Oil', nutrition_data_per: '100g',
      product_quantity_unit: 'ml', quantity: '1 L',
      nutriments: { 'energy-kcal_100g': 822, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 91 },
    } });
    expect(await lookupBarcode('8410660098804')).toMatchObject({ status: 422 });
    const requestedFields = new URL(String(fetcher.mock.calls[0][0])).searchParams.get('fields')?.split(',');
    expect(requestedFields).toContain('product_quantity_unit');
    expect(requestedFields).toContain('quantity');
  });

  it('does not treat a serving without a known weight as grams', async () => {
    provider({ status: 1, product: { ...product, serving_quantity: 2, serving_size: '2 pieces', serving_quantity_unit: undefined } });
    expect(await lookupBarcode('012345678905')).toMatchObject({ status: 200, food: { servingGrams: 100, servingLabel: '100 g' } });
  });

  it('does not mistake words in a serving label for volume units', async () => {
    provider({ status: 1, product: { ...product, serving_size: '1 eclair (40 g)' } });
    expect(await lookupBarcode('012345678905')).toMatchObject({ status: 200, food: { servingGrams: 40 } });
  });

  it.each([429, 500])('reports provider failures (%s) as retryable', async status => {
    provider({}, status);
    expect(await lookupBarcode('012345678905')).toMatchObject({ status: 503 });
  });

  it('handles network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await lookupBarcode('012345678905')).toMatchObject({ status: 503 });
  });
});
