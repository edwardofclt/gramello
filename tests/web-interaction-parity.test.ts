// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConfirmFoodRemoval } from '../components/confirm-food-removal';
import { TrendDayInspector } from '../components/trend-day-inspector';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const value = [...document.querySelectorAll('button')].find(element =>
    (element.getAttribute('aria-label') ?? element.textContent?.trim()) === label);
  expect(value, `Missing button: ${label}`).toBeDefined();
  return value!;
}

it('cancels removal without changing the diary and removes only after confirmation', async () => {
  function Diary() {
    const [entries, setEntries] = useState([{ id: 'entry-1', name: 'Banana' }]);
    const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
    return createElement('div', null,
      entries.map(entry => createElement('button', { key: entry.id, onClick: () => setSelected(entry) }, entry.name)),
      createElement(ConfirmFoodRemoval, {
        entry: selected, busy: false, onCancel: () => setSelected(null),
        onConfirm: () => { setEntries(items => items.filter(item => item.id !== selected?.id)); setSelected(null); },
      }));
  }
  await act(async () => root.render(createElement(Diary)));
  button('Banana').focus();
  await act(async () => button('Banana').click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Banana');
  expect(document.activeElement).toBe(button('Cancel'));
  await act(async () => button('Cancel').click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).toContain('Banana');
  // Radix restores focus from its deferred unmount autofocus callback.
  await vi.waitFor(() => expect(document.activeElement).toBe(button('Banana')));
  await act(async () => button('Banana').click());
  await act(async () => button('Remove food').click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).not.toContain('Banana');
});

it('prevents cancel, confirmation, and Escape while removal is pending', async () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  await act(async () => root.render(createElement(ConfirmFoodRemoval, {
    entry: { id: 'entry-1', name: 'Banana' }, busy: true, onCancel, onConfirm,
  })));
  expect(button('Cancel').disabled).toBe(true);
  const confirm = document.querySelector<HTMLButtonElement>('button[data-variant="destructive"]')!;
  expect(confirm.disabled).toBe(true);
  expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull();
  await act(async () => {
    button('Cancel').click();
    confirm.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(onCancel).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
});

it('keeps a failed removal available for retry and allows Escape to cancel', async () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  await act(async () => root.render(createElement(ConfirmFoodRemoval, {
    entry: { id: 'entry-1', name: 'Banana' }, busy: false,
    error: 'Could not save your diary.', onCancel, onConfirm,
  })));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Could not save your diary.');
  expect(button('Remove food').disabled).toBe(false);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();
});

const days = [
  { date: '2026-09-19', calories: 1800, protein: 100, carbs: 220, fat: 58 },
  { date: '2026-09-21', calories: 2000, protein: 130, carbs: 240, fat: 62 },
  { date: '2026-09-25', calories: 1900, protein: 120, carbs: 230, fat: 60 },
];

function selectedDate() { return container.querySelector('time')?.dateTime; }
function nutritionReadout() {
  return Object.fromEntries([...container.querySelectorAll('dt')].map(label => [label.textContent, label.nextElementSibling?.textContent]));
}

it('starts on the last logged day and navigates only among logged days', async () => {
  await act(async () => root.render(createElement(TrendDayInspector, { days: [days[2], days[0], days[1]] })));
  expect(selectedDate()).toBe('2026-09-25');
  expect(button('Next day').disabled).toBe(true);
  expect(nutritionReadout()).toEqual({ Calories: '1,900 kcal', Protein: '120g', Carbs: '230g', Fat: '60g' });
  await act(async () => button('Previous day').click());
  expect(selectedDate()).toBe('2026-09-21');
  await act(async () => button('Previous day').click());
  expect(selectedDate()).toBe('2026-09-19');
  expect(button('Previous day').disabled).toBe(true);
  await act(async () => button('Next day').click());
  expect(selectedDate()).toBe('2026-09-21');
});

it('keeps the selected date and updates its nutrition after diary data changes', async () => {
  await act(async () => root.render(createElement(TrendDayInspector, { days })));
  await act(async () => button('Previous day').click());
  await act(async () => root.render(createElement(TrendDayInspector, {
    days: [days[0], { ...days[1], calories: 1750, protein: 110, carbs: 200, fat: 52 }, days[2]],
  })));
  expect(selectedDate()).toBe('2026-09-21');
  expect(nutritionReadout()).toEqual({ Calories: '1,750 kcal', Protein: '110g', Carbs: '200g', Fat: '52g' });
});

it('supports arrow keys and resets selection to the last day after a range change', async () => {
  await act(async () => root.render(createElement(TrendDayInspector, { days })));
  await act(async () => button('Previous day').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(selectedDate()).toBe('2026-09-21');
  await act(async () => button('Next day').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(selectedDate()).toBe('2026-09-25');
  await act(async () => button('Previous day').click());
  await act(async () => root.render(createElement(TrendDayInspector, { days: days.slice(0, 1) })));
  expect(selectedDate()).toBe('2026-09-19');
  expect(button('Previous day').disabled).toBe(true);
  expect(button('Next day').disabled).toBe(true);
  await act(async () => root.render(createElement(TrendDayInspector, { days })));
  expect(selectedDate()).toBe('2026-09-25');
});

it('does not display navigation or stale nutrition when a range has no logged days', async () => {
  await act(async () => root.render(createElement(TrendDayInspector, { days })));
  await act(async () => root.render(createElement(TrendDayInspector, { days: [] })));
  expect(container.querySelector('button')).toBeNull();
  expect(container.querySelector('time')).toBeNull();
  expect(container.textContent).toBe('');
});
