// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useEntryEdit } from '../hooks/use-entry-edit';

it.each([
  { unit: 'grams', grams: null }, { unit: 'grams', grams: 0 },
  { unit: 'ounces', grams: null }, { unit: 'ounces', grams: 0 },
] as const)('retains a legacy $unit draft when its selected measure is pressed (grams=$grams)', async ({ unit, grams }) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  let edit!: ReturnType<typeof useEntryEdit>;
  function Editor() {
    edit = useEntryEdit({ id: 'legacy', meal: 'Lunch', quantity: 2, unit, grams, calories: 320, protein: 8, carbs: 48, fat: 8 },
      async () => { throw new Error('No request expected while editing.'); }, () => {});
    return null;
  }
  try {
    await act(async () => root.render(createElement(Editor)));
    await act(async () => edit.setQuantity('4'));
    await act(async () => edit.changeUnit(unit));
    expect(edit.quantity).toBe('4');
    expect(edit.unit).toBe(unit);
    expect(edit.portion).toEqual({ grams, calories: 640, protein: 16, carbs: 96, fat: 16 });
    await act(async () => edit.changeUnit(unit === 'grams' ? 'ounces' : 'grams'));
    expect(edit.quantity).toBe('4');
    expect(edit.unit).toBe(unit);
    expect(edit.portion?.calories).toBe(640);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
