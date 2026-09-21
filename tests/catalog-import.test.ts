import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogSql, validateCatalog } from '../scripts/restaurant-catalog.mjs';

const catalog = { chain: "Example's", sourceUrl: 'https://example.com/nutrition.pdf', retrievedAt: '2026-09-20', foods: [
  { id: 'bowl', name: 'Bowl', servingLabel: '1 bowl', calories: 600, protein: 30, carbs: 65, fat: 25 },
] };

describe('restaurant import', () => {
  it('preserves legacy diary rows through the catalog migration', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync(new URL('../drizzle/0000_silent_ultragirl.sql', import.meta.url), 'utf8'));
    db.exec(readFileSync(new URL('../drizzle/0001_gray_odin.sql', import.meta.url), 'utf8'));
    db.exec("INSERT INTO entries VALUES ('old','alice','2026-09-19','Dinner','Old food',NULL,'custom',NULL,1,'serving',100,605,30,65,25,'yesterday')");
    db.exec(readFileSync(new URL('../drizzle/0002_custom_meals.sql', import.meta.url), 'utf8'));
    db.exec("INSERT INTO custom_meals VALUES ('meal','alice','Soup','[]',400,100,'yesterday')");
    db.exec(readFileSync(new URL('../drizzle/0003_food_catalog.sql', import.meta.url), 'utf8'));
    expect(db.prepare('SELECT name, total_grams FROM custom_meals').get()).toMatchObject({ name: 'Soup', total_grams: 400 });
    expect(db.prepare('SELECT id, user_id, calories, grams, verified FROM entries').get()).toMatchObject({ id: 'old', user_id: 'alice', calories: 605, grams: 100, verified: 0 });
    db.close();
  });
  it('imports official per-serving values with source evidence, no invented weight, and idempotent updates', () => {
    const db = new DatabaseSync(':memory:');
    for (const file of ['0000_silent_ultragirl', '0001_gray_odin', '0002_custom_meals', '0003_food_catalog']) db.exec(readFileSync(new URL(`../drizzle/${file}.sql`, import.meta.url), 'utf8'));
    const sql = catalogSql('example', catalog);
    db.exec(sql); db.exec(sql);
    expect(db.prepare('SELECT id,brand,verified,source_kind,source_url,nutrition_basis,serving_grams,calories,protein FROM foods').all()).toEqual([
      expect.objectContaining({ id:'restaurant-example-bowl', brand:"Example's", verified:1, source_kind:'restaurant', source_url:'https://example.com/nutrition.pdf', nutrition_basis:'serving', serving_grams:null, calories:600, protein:30 }),
    ]);
    db.close();
  });
  it.each([
    { ...catalog, sourceUrl: '' },
    { ...catalog, foods: [{ ...catalog.foods[0], protein: null }] },
    { ...catalog, foods: [{ ...catalog.foods[0], fat: -1 }] },
    { ...catalog, foods: [catalog.foods[0], catalog.foods[0]] },
  ])('rejects unverifiable or malformed source records', value => {
    expect(() => validateCatalog(value)).toThrow();
  });
});
