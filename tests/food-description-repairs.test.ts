import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadOfflineFoods } from '../scripts/food-catalog.mjs';

it('restores the beverage identity from Cook Out’s table headings without changing servings', () => {
  const foods = loadOfflineFoods();
  expect(foods.find((food: { id: string }) => food.id === 'restaurant-cook-out-large-24-oz-680-4-g'))
    .toMatchObject({ name: 'Coca-Cola Large', calories: 210, carbs: 59, servingLabel: '24 oz (680.4 g)' });
  expect(foods.find((food: { id: string }) => food.id === 'restaurant-cook-out-large-24-oz-680-4-g-2'))
    .toMatchObject({ name: 'Diet Coke Large', calories: 0, carbs: 0 });
  expect(foods.find((food: { id: string }) => food.id === 'restaurant-cook-out-large-24-oz-680-4-g-10'))
    .toMatchObject({ name: 'Dr. Pepper Large', calories: 210, carbs: 56 });
});

it('migrates only evidenced descriptions, preserves nutrition and IDs, and is idempotent', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const file of ['0000_silent_ultragirl', '0001_gray_odin', '0002_custom_meals', '0003_food_catalog', '0004_restaurant_catalog']) {
      db.exec(readFileSync(`drizzle/${file}.sql`, 'utf8'));
    }
    const before = db.prepare("SELECT * FROM foods WHERE id LIKE 'restaurant-cook-out-%' ORDER BY id").all();
    const migration = readFileSync('drizzle/0008_food_description_repairs.sql', 'utf8');
    db.exec(migration); db.exec(migration);
    const after = db.prepare("SELECT * FROM foods WHERE id LIKE 'restaurant-cook-out-%' ORDER BY id").all();
    expect(after.filter((row, index) => row.name !== before[index].name)).toHaveLength(35);
    const withoutName = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'name'));
    expect(after.map(withoutName)).toEqual(before.map(withoutName));
    expect(after.find(row => row.id === 'restaurant-cook-out-large-24-oz-680-4-g-12')?.name).toBe('Powerade Mountain Blast Large');
  } finally { db.close(); }
});
