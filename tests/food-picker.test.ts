// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FoodPicker } from '../components/food-picker';
import type { Food } from '../lib/food';
import type { FoodApi } from '../lib/food-api';

vi.mock('../components/barcode-scanner', () => ({ BarcodeScanner: () => null }));
vi.mock('../components/custom-food-form', () => ({ CustomFoodForm: ({ onSaved }: { onSaved: (food: Food) => void }) => createElement('button', { className: 'save-custom', onClick: () => onSaved(egg) }, 'Save custom food') }));

const egg: Food = { id: 'egg', name: 'Egg', source: 'Test', calories: 143, protein: 12.56, carbs: .72, fat: 9.51,
  nutritionBasis: '100g', servingGrams: 50, servingLabel: '1 large (50 g)', servingOptions: [
    { id: 'large', label: '1 large (50 g)', grams: 50 }, { id: 'medium', label: '1 medium (44 g)', grams: 44 },
  ] };
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); container.setAttribute('role', 'dialog'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});
async function input(value: string, element = container.querySelector('input')!) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function select(label: string, value: string) {
  await act(async () => {
    const element = container.querySelector(`select[aria-label="${label}"]`) as unknown as HTMLSelectElement;
    element.value = value; element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function click(selector: string) { await act(async () => container.querySelector<HTMLElement>(selector)!.click()); }

it('keeps the count across portion choices, converts measures without changing the food amount, and submits the chosen portion', async () => {
  const onChoose = vi.fn();
  await act(async () => root.render(createElement(FoodPicker, { api: vi.fn() as FoodApi, initialFood: egg, onChoose, actionLabel: 'Add food' })));
  await input('2');
  await select('Serving size', 'medium');
  expect(container.querySelector('input')!.value).toBe('2');
  expect(container.textContent).toContain('2 × 1 medium (44 g) = 88 g total');
  expect(container.querySelector('.nutrition-preview')!.textContent).toContain('126');
  await select('Measure', 'grams');
  expect(container.querySelector('input')!.value).toBe('88');
  await select('Measure', 'serving');
  expect(container.querySelector('input')!.value).toBe('2');
  expect((container.querySelector('[aria-label="Serving size"]') as unknown as HTMLSelectElement).value).toBe('medium');
  await click('.confirm-button');
  expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2, unit: 'serving', food: expect.objectContaining({ selectedServingId: 'medium', servingGrams: 44 }) }));
});

it('restores the exact search after inspecting a result without refetching, refocusing, or losing scroll position', async () => {
  const foods = [egg, { ...egg, id: 'other', name: 'Eggs, scrambled' }];
  const api = vi.fn().mockResolvedValueOnce({ foods, hasMore: true }).mockResolvedValue({ foods: [] });
  await act(async () => root.render(createElement(FoodPicker, { api: api as FoodApi, onChoose: vi.fn(), actionLabel: 'Add food' })));
  await input('eggs');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  container.scrollTop = 480;
  await click('.result-row');
  expect(container.scrollTop).toBe(0);
  await click('.back-link');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.querySelector('input')!.value).toBe('eggs');
  expect([...container.querySelectorAll('.result-row strong')].map(node => node.textContent)).toEqual(['Egg', 'Eggs, scrambled']);
  expect(container.textContent).toContain('Showing the first 100 matches');
  expect(container.scrollTop).toBe(480);
  expect(document.activeElement).not.toBe(container.querySelector('input'));
  expect(api).toHaveBeenCalledTimes(1);

  // A whitespace edit clears the old list and must still complete a new search.
  api.mockResolvedValue({ foods });
  await input('eggs ');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(api).toHaveBeenCalledTimes(2);
  expect(container.querySelectorAll('.result-row')).toHaveLength(2);
});

it('refreshes an earlier empty search after a new custom food is saved', async () => {
  const api = vi.fn().mockResolvedValueOnce({ foods: [] }).mockResolvedValue({ foods: [egg] });
  await act(async () => root.render(createElement(FoodPicker, { api: api as FoodApi, onChoose: vi.fn(), actionLabel: 'Add food' })));
  await input('eggs');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(container.textContent).toContain('No matches yet');
  await click('.food-actions button:last-child');
  await click('.save-custom');
  await click('.back-link');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(api).toHaveBeenCalledTimes(2);
  expect(container.querySelectorAll('.result-row')).toHaveLength(1);
});
