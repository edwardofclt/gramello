import { expect, it } from 'vitest';
import { editedPortion, entryUnits } from '../lib/entry-edit';

const entry = { quantity: 2, unit: 'serving', grams: 80, calories: 320, protein: 8, carbs: 48, fat: 8 };

it('scales the saved portion when editing servings or weight', () => {
  expect(editedPortion(entry, 1, 'serving')).toEqual({ grams: 40, calories: 160, protein: 4, carbs: 24, fat: 4 });
  expect(editedPortion(entry, 120, 'grams')).toEqual({ grams: 120, calories: 480, protein: 12, carbs: 72, fat: 12 });
  expect(editedPortion(entry, 1, 'ounces')?.grams).toBeCloseTo(28.349523125);
});

it('supports zero-calorie liquids and never assumes a liquid’s weight', () => {
  const liquid = { ...entry, unit: 'milliliters', quantity: 100, grams: null, calories: 0, protein: 0, carbs: 0, fat: 0 };
  expect(entryUnits(liquid)).toEqual(['milliliters', 'fluid-ounces']);
  expect(editedPortion(liquid, 10, 'fluid-ounces')).toEqual({ grams: null, calories: 0, protein: 0, carbs: 0, fat: 0 });
  expect(editedPortion({ ...liquid, calories: 100 }, 1, 'fluid-ounces')?.calories).toBeCloseTo(29.5735295625);
  expect(editedPortion(liquid, 1, 'grams')).toBeNull();
});

it('edits servings without weight and offers only known conversions', () => {
  expect(entryUnits({ ...entry, grams: null })).toEqual(['serving']);
  expect(editedPortion({ ...entry, grams: null }, .5, 'serving')).toEqual({ grams: null, calories: 80, protein: 2, carbs: 12, fat: 2 });
  expect(editedPortion({ ...entry, grams: 0 }, 1, 'grams')).toBeNull();
  expect(entryUnits({ ...entry, unit: 'grams' })).toEqual(['grams', 'ounces']);
});

it.each([0, -1, Infinity, NaN, 1_000_001])('rejects invalid quantities: %s', quantity => {
  expect(editedPortion(entry, quantity, 'serving')).toBeNull();
});
