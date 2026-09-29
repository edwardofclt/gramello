import { describe, expect, it } from 'vitest';
import usda from './fixtures/al-fresco-usda.json';
import off from './fixtures/al-fresco-off.json';
import { normalizeUsdaBranded, normalizeOffProduct, canonicalGtin } from '../lib/catalog-import';
import { scaleFood } from '../lib/food';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFoodPacks, signPackSet } from '../scripts/food-packs.mjs';
import { testDatabase } from './helpers/local-sqlite';
import { createCatalogReader, inspectCatalog } from '../mobile/src/catalog/queries';
import { createPackCatalog } from '../mobile/src/catalog/pack-reader';
import type { FoodPack } from '../mobile/src/catalog/packs';
import { spawnSync } from 'node:child_process';
import { rankFoodSearch } from '../lib/search';
import { generateKeyPairSync } from 'node:crypto';
import { verifyPackManifest } from '../mobile/src/catalog/packs';

describe('US branded imports', () => {
  it('preserves USDA Al Fresco per-100g values and the printed 50g patty', () => {
    const food = normalizeUsdaBranded(usda)!;
    expect(food).toMatchObject({ id: 'usda-1892562', barcodes: ['00030771094625'], nutritionBasis: '100g', servingGrams: 50 });
    expect(scaleFood(food, 1, 'serving')).toMatchObject({ calories: 90, protein: 8, carbs: 4, fat: 4 });
  });
  it('keeps the OFF disagreement as a separate record', () => {
    const food = normalizeOffProduct(off)!;
    expect(food).toMatchObject({ id: 'off-0030771094625', barcodes: ['00030771094625'], servingGrams: 50 });
    expect(scaleFood(food, 1, 'serving')).toMatchObject({ calories: 90, protein: 9, carbs: 5, fat: 4 });
  });
  it('filters explicit non-US and unknown markets, and obsolete products', () => {
    expect(normalizeUsdaBranded({ ...usda, marketCountry: 'Canada' })).toBeNull();
    expect(normalizeUsdaBranded({ ...usda, marketCountry: undefined })).toBeNull();
    expect(normalizeOffProduct({ ...off, countries_tags: ['en:canada'] })).toBeNull();
    expect(normalizeOffProduct({ ...off, obsolete: true })).toBeNull();
  });
  it('still classifies a USDA branded product as packaged if the brand is absent', () => {
    const food = normalizeUsdaBranded({ ...usda, brandName: undefined, brandOwner: undefined })!;
    expect(rankFoodSearch('chicken sausage', [food], { category: 'packaged' }).foods).toHaveLength(1);
  });
  it('rejects missing, negative and implausible macros without inventing zeroes', () => {
    expect(normalizeUsdaBranded({ ...usda, foodNutrients: usda.foodNutrients.slice(1) })).toBeNull();
    for (const value of [null, '', -1, 101, Infinity]) {
      expect(normalizeOffProduct({ ...off, nutriments: { ...off.nutriments, proteins_100g: value } })).toBeNull();
    }
    expect(normalizeOffProduct({ ...off, nutriments: { ...off.nutriments, proteins_100g: 0 } })?.protein).toBe(0);
  });
  it('does not pretend mL is grams for USDA liquids', () => {
    const food = normalizeUsdaBranded({ ...usda, servingSizeUnit: 'ml', servingSize: 240 })!;
    expect(food).toMatchObject({ nutritionBasis: '100ml', nutritionUnit: 'ml', servingMl: 240, servingGrams: null });
    expect(scaleFood(food, 1, 'serving')!.calories).toBe(432);
  });
  it('validates check digits and equates UPC/EAN leading zeroes', () => {
    expect(canonicalGtin('030771094625')).toBe('00030771094625');
    expect(canonicalGtin('0030771094625')).toBe('00030771094625');
    expect(canonicalGtin('030771094626')).toBeNull();
    expect(canonicalGtin('not-a-code')).toBeNull();
    expect(canonicalGtin('00000000')).toBeNull();
  });
  it('recovers a printed metric serving when OFF serving_quantity is absent', () => {
    const food = normalizeOffProduct({ ...off, serving_quantity: undefined, serving_size: '1 patty (50 g)' })!;
    expect(scaleFood(food, 1, 'serving')).toMatchObject({ calories: 90, protein: 9 });
  });
  it('builds separate source SQLite packs which search and scale offline', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'gramello-packs-'));
    try {
      writeFileSync(join(directory, 'usda.jsonl'), JSON.stringify(usda) + '\n');
      writeFileSync(join(directory, 'off.jsonl'), JSON.stringify(off) + '\n');
      const result = await buildFoodPacks({ usda: join(directory, 'usda.jsonl'), off: join(directory, 'off.jsonl'), output: join(directory, 'packs'), baseUrl: 'https://example.org/packs/', buckets: 4 });
      expect(result.packs).toHaveLength(2);
      const keys = generateKeyPairSync('ed25519');
      const pem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
      const key = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
      expect(verifyPackManifest(signPackSet(result, pem, key), key).version).toBe(result.version);
      expect(() => signPackSet(result, pem, '0'.repeat(64))).toThrow('trust key');
      for (const pack of result.packs) {
        const file = join(directory, 'packs', new URL(pack.url).pathname.split('/').at(-1)!);
        expect(readFileSync(file).length).toBe(pack.bytes);
        const opened = testDatabase(file);
        try {
          await expect(inspectCatalog(opened.db, pack)).resolves.toMatchObject({ count: 1 });
          const reader = createCatalogReader(work => work(opened.db));
          expect((await reader.search('al fresco apple maple sausage')).length).toBe(1);
          if (pack.source === 'off') expect((await reader.search('alfresco breakfast chicken sausage')).map(food => food.id)).toEqual(['off-0030771094625']);
          const food = (await reader.barcode('030771094625'))!;
          expect(food.source).toBe(pack.source === 'usda-branded' ? 'USDA FoodData Central' : 'Open Food Facts');
          expect(scaleFood(food, 1, 'serving')!.calories).toBe(90);
        } finally { opened.raw.close(); }
      }
      const verified = spawnSync(process.execPath, ['scripts/verify-food-packs.mjs', join(directory, 'packs')], { encoding: 'utf8' });
      expect(verified.status).toBe(0);
      expect(JSON.parse(verified.stdout)).toMatchObject({ foodCount: 2, maximumOpenExpansionDatabases: 1, barcode: { serving: { calories: 90 } } });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('keeps old barcode coverage through an interrupted partition-count change', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'gramello-partitions-'));
    try {
      const input = join(directory, 'off.jsonl');
      writeFileSync(input, [off, { ...off, code: '0030771096766', product_name: 'Country Style Chicken Sausage' }].map(row => JSON.stringify(row)).join('\n') + '\n');
      const old = await buildFoodPacks({ off: input, output: join(directory, 'old'), baseUrl: 'https://example.org/old/', buckets: 1 });
      const next = await buildFoodPacks({ off: input, output: join(directory, 'next'), baseUrl: 'https://example.org/next/', buckets: 2 });
      const committed = next.packs.find((pack: FoodPack) => pack.bucket === 0)!;
      const installed = [...old.packs.filter((pack: FoodPack) => pack.id !== committed.id), committed];
      const reader = createPackCatalog(async () => installed, async (pack, work) => {
        const path = new URL(pack.url).pathname;
        const opened = testDatabase(join(directory, path));
        try { return await work(createCatalogReader(read => read(opened.db))); }
        finally { opened.raw.close(); }
      }, { getFood: async () => null, search: async () => [], barcode: async () => null });
      expect((await reader.barcode('030771094625'))?.id).toBe('off-0030771094625');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('fails a two-source build if one source silently yields no valid US products', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'gramello-empty-source-'));
    try {
      writeFileSync(join(directory, 'usda.jsonl'), JSON.stringify({ ...usda, marketCountry: 'Canada' }) + '\n');
      writeFileSync(join(directory, 'off.jsonl'), JSON.stringify(off) + '\n');
      await expect(buildFoodPacks({ usda: join(directory, 'usda.jsonl'), off: join(directory, 'off.jsonl'), output: join(directory, 'packs'), baseUrl: 'https://example.org/' })).rejects.toThrow('no valid US products');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
