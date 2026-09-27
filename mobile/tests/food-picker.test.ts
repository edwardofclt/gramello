// @vitest-environment jsdom
import { act, createElement, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FoodPicker } from '../src/screens/FoodPicker';
import type { Food } from '../../lib/food';

const runtime = vi.hoisted(() => ({ api: vi.fn(), scroll: { capture: vi.fn(() => 480), showTop: vi.fn(), restore: vi.fn() } }));
vi.mock('../src/diary/Session', () => ({ useSession: () => ({ api: runtime.api, local: true }) }));
vi.mock('../src/components/AppDialog', () => ({ useDialogScroll: () => runtime.scroll }));
vi.mock('../src/components/BarcodeScanner', () => ({ BarcodeScanner: ({ onBack }: { onBack: () => void }) => createElement('button', { onClick: onBack }, 'Back') }));
vi.mock('../src/components/CustomFoodForm', () => ({ CustomFoodForm: ({ onSaved, onBack }: { onSaved: (food: Food) => void; onBack: () => void }) => createElement('div', null, createElement('button', { onClick: () => onSaved(egg) }, 'Save custom food'), createElement('button', { onClick: onBack }, 'Back')) }));
vi.mock('../src/components/FoodVerification', () => ({ FoodVerification: () => null }));
vi.mock('lucide-react-native', () => ({ Check: () => null, ChevronDown: () => null, ChevronLeft: () => null, ChevronRight: () => null, Minus: () => null, Plus: () => null, ScanBarcode: () => null, Search: () => null }));
vi.mock('react-native', () => {
  const view = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return { View: view, Text: view, ScrollView: view, ActivityIndicator: () => null, Image: () => null, Linking: { openURL: vi.fn() },
    Pressable: ({ ref, children, onPress, disabled, accessibilityLabel, accessibilityRole, accessibilityState }: { ref?: Ref<HTMLButtonElement>; children: ReactNode; onPress: () => void; disabled?: boolean; accessibilityLabel?: string; accessibilityRole?: string; accessibilityState?: { checked?: boolean } }) =>
      createElement('button', { ref, onClick: onPress, disabled, 'aria-label': accessibilityLabel, role: accessibilityRole, 'aria-checked': accessibilityState?.checked }, children),
  };
});
vi.mock('../src/components/ui', () => {
  const view = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return { colors: {}, styles: {}, useLayout: () => ({ width: 390 }), Card: view,
    ErrorNotice: ({ message }: { message: string }) => createElement('div', { role: 'alert' }, message),
    Action: ({ children, label, onPress, disabled }: { children: ReactNode; label?: string; onPress: () => void; disabled?: boolean }) => createElement('button', { 'aria-label': label, onClick: onPress, disabled }, children),
    Field: ({ label, value, onChangeText, autoFocus, onSubmitEditing }: { label: string; value: string; onChangeText: (value: string) => void; autoFocus?: boolean; onSubmitEditing?: () => void }) => createElement('input', { 'aria-label': label, value, autoFocus, onChange: event => onChangeText(event.target.value), onKeyDown: event => { if (event.key === 'Enter') onSubmitEditing?.(); } }),
  };
});

const egg: Food = { id: 'egg', name: 'Egg', source: 'Test', calories: 143, protein: 12.56, carbs: .72, fat: 9.51,
  nutritionBasis: '100g', servingGrams: 50, servingLabel: '1 large (50 g)', servingOptions: [
    { id: 'large', label: '1 large (50 g)', grams: 50 }, { id: 'medium', label: '1 medium (44 g)', grams: 44 },
  ] };
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); runtime.api.mockReset();
  runtime.scroll.capture.mockClear(); runtime.scroll.showTop.mockClear(); runtime.scroll.restore.mockClear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function input(value: string) {
  await act(async () => {
    const element = container.querySelector('input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function button(name: string) {
  const target = Array.from(container.querySelectorAll('button')).find(element => (element.getAttribute('aria-label') ?? element.textContent) === name)!;
  expect(target).toBeTruthy(); await act(async () => target.click());
}

it('uses one search field without an online action and lets Enter find more matches sooner', async () => {
  runtime.api.mockResolvedValue({ foods: [egg] });
  await act(async () => root.render(createElement(FoodPicker, { date: '2026-09-23', initialMeal: 'Breakfast', onSaved: vi.fn() })));
  expect(container.textContent).not.toContain('Search online');
  expect(container.textContent).not.toContain('saved for offline');
  await input('eggs');
  await act(async () => container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(runtime.api.mock.calls.some(([path]) => new URL(path, 'http://localhost').searchParams.get('online') === '1')).toBe(true);
});

it.each(['Scan barcode', 'Add custom food'])('pauses pending work while opening %s and returning', async action => {
  runtime.api.mockResolvedValue({ foods: [egg] });
  await act(async () => root.render(createElement(FoodPicker, { date: '2026-09-23', initialMeal: 'Breakfast', onSaved: vi.fn() })));
  await input('eggs');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  await button(action);
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  await button('Back');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(runtime.api).toHaveBeenCalledTimes(1);
  expect(container.querySelector('input')!.value).toBe('eggs');
  expect(container.textContent).toContain('Egg');
});

it('keeps a result selectable while finding more matches and ignores a late response after selection', async () => {
  let complete!: (value: { foods: Food[] }) => void;
  runtime.api.mockResolvedValueOnce({ foods: [egg] }).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  await act(async () => root.render(createElement(FoodPicker, { date: '2026-09-23', initialMeal: 'Breakfast', onSaved: vi.fn() })));
  await input('eggs');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.textContent).toContain('Finding more matches…');
  const result = Array.from(container.querySelectorAll('button')).find(element => element.textContent?.includes('EggTest'))!;
  await act(async () => result.click());
  expect(runtime.api.mock.calls[1][1].signal.aborted).toBe(true);
  await act(async () => complete({ foods: [{ ...egg, id: 'late', name: 'Late replacement' }] }));
  await button('Back to results');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.textContent).toContain('Egg');
  expect(container.textContent).not.toContain('Late replacement');
  expect(runtime.api).toHaveBeenCalledTimes(2);
});

it('keeps two selected portions through measure changes and tapping the active measure again', async () => {
  const onIngredient = vi.fn();
  await act(async () => root.render(createElement(FoodPicker, { date: '2026-09-23', initialMeal: 'Breakfast', initialFood: egg, onSaved: vi.fn(), onIngredient })));
  await input('2');
  await button('Serving size: 1 large (50 g)');
  expect(container.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('aria-label')).toBe('1 large (50 g)');
  await button('1 medium (44 g)');
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Serving size: 1 medium (44 g)');
  expect(container.textContent).toContain('2 × 1 medium (44 g) = 88 g total');
  await button('Servings');
  expect(container.querySelector('input')!.value).toBe('2');
  await button('Grams');
  expect(container.querySelector('input')!.value).toBe('88');
  await button('Servings');
  await button('Add ingredient');
  expect(onIngredient).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2, unit: 'serving', food: expect.objectContaining({ selectedServingId: 'medium', servingGrams: 44 }) }));
});

it('returns to the previous search and position without starting another request or reopening the keyboard', async () => {
  const foods = [egg, { ...egg, id: 'scrambled', name: 'Eggs, scrambled' }];
  runtime.api.mockResolvedValueOnce({ foods, hasMore: true }).mockResolvedValue({ foods: [] });
  await act(async () => root.render(createElement(FoodPicker, { date: '2026-09-23', initialMeal: 'Breakfast', onSaved: vi.fn() })));
  await input('eggs');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  const result = Array.from(container.querySelectorAll('button')).find(element => element.textContent?.includes('EggTest'))!;
  await act(async () => result.click());
  expect(runtime.scroll.capture).toHaveBeenCalledOnce();
  expect(runtime.scroll.showTop).toHaveBeenCalledOnce();
  await button('Back to results');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(runtime.scroll.restore).toHaveBeenLastCalledWith(480);
  expect(container.querySelector('input')!.value).toBe('eggs');
  expect(container.textContent).toContain('Eggs, scrambled');
  expect(Array.from(container.querySelectorAll('button')).some(element => element.textContent === 'Find more matches')).toBe(true);
  expect(document.activeElement).not.toBe(container.querySelector('input'));
  expect(runtime.api).toHaveBeenCalledTimes(1);
  runtime.api.mockResolvedValue({ foods });
  await input('eggs ');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(runtime.api).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('Eggs, scrambled');
});

it('refreshes an earlier empty search after a new custom food is saved', async () => {
  runtime.api.mockResolvedValueOnce({ foods: [] }).mockResolvedValue({ foods: [egg] });
  await act(async () => root.render(createElement(FoodPicker, { date: '2026-09-23', initialMeal: 'Breakfast', onSaved: vi.fn() })));
  await input('eggs');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(container.textContent).toContain('No matches yet');
  await button('Add custom food');
  await button('Save custom food');
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(runtime.api).toHaveBeenCalledTimes(1);
  await button('Back to results');
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(runtime.api).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain('No matches yet');
});
