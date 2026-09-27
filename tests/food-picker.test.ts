// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FoodPicker } from '../components/food-picker';
import type { Food } from '../lib/food';
import type { FoodApi } from '../lib/food-api';

vi.mock('../components/barcode-scanner', () => ({ BarcodeScanner: ({ onBack }: { onBack: () => void }) => createElement('button', { className: 'return-search', onClick: onBack }, 'Back') }));
vi.mock('../components/custom-food-form', () => ({ CustomFoodForm: ({ onSaved, onBack }: { onSaved: (food: Food) => void; onBack: () => void }) => createElement('div', null, createElement('button', { className: 'save-custom', onClick: () => onSaved(egg) }, 'Save custom food'), createElement('button', { className: 'return-search', onClick: onBack }, 'Back')) }));

const egg: Food = { id: 'egg', name: 'Egg', source: 'Test', calories: 143, protein: 12.56, carbs: .72, fat: 9.51,
  nutritionBasis: '100g', servingGrams: 50, servingLabel: '1 large (50 g)', servingOptions: [
    { id: 'large', label: '1 large (50 g)', grams: 50 }, { id: 'medium', label: '1 medium (44 g)', grams: 44 },
  ] };
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); container.setAttribute('role', 'dialog'); container.className = 'food-dialog'; document.body.appendChild(container);
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

it('uses one search field without an online action and lets Enter find more matches sooner', async () => {
  const api = vi.fn().mockResolvedValue({ foods: [egg] });
  await act(async () => root.render(createElement(FoodPicker, { api: api as FoodApi, onChoose: vi.fn(), actionLabel: 'Add food' })));
  expect(container.textContent).not.toContain('Search online');
  expect(container.textContent).not.toContain('downloaded foods');
  await input('eggs');
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(api.mock.calls.some(([path]) => new URL(path, 'http://localhost').searchParams.get('online') === '1')).toBe(true);
});

it.each(['first-child', 'last-child'])('pauses pending work while opening scanner or custom food (%s) and returning', async action => {
  const api = vi.fn().mockResolvedValue({ foods: [egg] });
  await act(async () => root.render(createElement(FoodPicker, { api: api as FoodApi, onChoose: vi.fn(), actionLabel: 'Add food' })));
  await input('eggs');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  await click(`.food-actions button:${action}`);
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  await click('.return-search');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(api).toHaveBeenCalledTimes(1);
  expect(container.querySelector('input')!.value).toBe('eggs');
  expect(container.querySelector('.result-row strong')?.textContent).toBe('Egg');
});

it('keeps a result selectable while finding more matches and ignores a late response after selection', async () => {
  let complete!: (value: { foods: Food[] }) => void;
  const api = vi.fn().mockResolvedValueOnce({ foods: [egg] }).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  await act(async () => root.render(createElement(FoodPicker, { api: api as FoodApi, onChoose: vi.fn(), actionLabel: 'Add food' })));
  await input('eggs');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Finding more matches…');
  await click('.result-row');
  expect(api.mock.calls[1][1].signal.aborted).toBe(true);
  await act(async () => complete({ foods: [{ ...egg, id: 'late', name: 'Late replacement' }] }));
  await click('.back-link');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.querySelector('.result-row strong')?.textContent).toBe('Egg');
  expect(container.textContent).not.toContain('Late replacement');
  expect(api).toHaveBeenCalledTimes(2);
});

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
  expect(container.querySelector('.search-continuation')?.textContent).toBe('Find more matches');
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
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(api).toHaveBeenCalledTimes(1);
  await click('.back-link');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(api).toHaveBeenCalledTimes(2);
  expect(container.querySelectorAll('.result-row')).toHaveLength(1);
});
