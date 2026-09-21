// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import NourishApp from '../app/nourish-app';
import { localDate } from '../mobile/src/lib/nutrition';

const user = { userId: 'auth0|diary-test', displayName: 'Diary Test', email: null };
const goals = { calories: 2400, protein: 180, carbs: 250, fat: 70 };
const lunch = { id: 'mobile-lunch', meal: 'Lunch', name: 'Lunch from phone', source: 'custom',
  quantity: 1, unit: 'serving', grams: 100, calories: 400, protein: 25, carbs: 40, fat: 15 };
let container: HTMLDivElement;
let root: Root | undefined;
let entries: typeof lunch[];
let entryDate: string;
let requestedDates: string[];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubEnv('TZ', 'America/New_York');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-19T16:00:00Z'));
  entries = [];
  entryDate = '2026-09-19';
  requestedDates = [];
  vi.stubGlobal('fetch', async (input: string) => {
    const url = new URL(input, 'https://nourish.test');
    if (url.pathname === '/api/day') {
      const date = url.searchParams.get('date')!;
      requestedDates.push(date);
      return Response.json({ goals, entries: date === entryDate ? entries : [] });
    }
    if (url.pathname === '/api/trends') return Response.json({ days: [] });
    throw new Error(`Unexpected request: ${input}`);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(NourishApp, { user }));
  });
}

async function navigate(label: 'Today' | 'Trends') {
  const button = [...container.querySelectorAll<HTMLButtonElement>('nav button')]
    .find(button => button.textContent === label)!;
  await act(async () => button.click());
}

it.each([
  ['America/New_York', '2026-09-20T01:00:00Z', '2026-09-19'],
  ['Asia/Tokyo', '2026-09-19T16:00:00Z', '2026-09-20'],
  ['UTC', '2026-09-19T16:00:00Z', '2026-09-19'],
])('hydrates a UTC server page into the mobile diary date in %s', async (zone, now, expectedDate) => {
  vi.setSystemTime(new Date(now));
  vi.stubEnv('TZ', 'UTC');
  container.innerHTML = renderToString(createElement(NourishApp, { user }));
  vi.stubEnv('TZ', zone);
  entryDate = expectedDate;
  entries = [lunch];
  const hydrationError = vi.fn();
  await act(async () => {
    root = hydrateRoot(container, createElement(NourishApp, { user }), { onRecoverableError: hydrationError });
  });

  expect(localDate()).toBe(expectedDate);
  expect(requestedDates).toEqual([expectedDate]);
  expect(container.querySelector('.food-row')?.textContent ?? '').toContain('Lunch from phone');
  expect(container.querySelector('.date-row')?.textContent).toBe('Today');
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Next day"]')?.disabled).toBe(true);
  expect(hydrationError).not.toHaveBeenCalled();

  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Previous day"]')!.click());
  expect(container.querySelector('.food-row')).toBeNull();
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Next day"]')?.disabled).toBe(false);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next day"]')!.click());
  expect(container.querySelector('.food-row')?.textContent ?? '').toContain('Lunch from phone');
});

it.each(['focus', 'visibilitychange'])('shows food added on another device after %s', async event => {
  await mount();
  expect(container.querySelector('.food-row')).toBeNull();
  entries = [lunch];
  await act(async () => {
    if (event === 'visibilitychange') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      document.dispatchEvent(new Event(event));
    } else {
      window.dispatchEvent(new Event(event));
    }
  });
  expect(container.querySelector('.food-row')?.textContent ?? '').toContain('Lunch from phone');
});

it('reloads the diary when returning from Trends', async () => {
  await mount();
  await navigate('Trends');
  entries = [lunch];
  await navigate('Today');
  expect(container.querySelector('.food-row')?.textContent ?? '').toContain('Lunch from phone');
});

it('loads current goals when Trends opens before the diary request finishes', async () => {
  const pending: ((response: Response) => void)[] = [];
  vi.stubGlobal('fetch', (input: string) => {
    if (input.startsWith('/api/day')) return new Promise<Response>(resolve => pending.push(resolve));
    return Promise.resolve(Response.json({ days: [] }));
  });
  await mount();
  await navigate('Trends');
  await act(async () => {
    for (const finish of pending) finish(Response.json({ goals: { ...goals, protein: 150 }, entries: [] }));
  });
  expect(container.textContent).toContain('-150g vs target');
});

it('refreshes the selected historical day without jumping to today', async () => {
  await mount();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Previous day"]')!.click());
  entryDate = '2026-09-18';
  entries = [lunch];
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(requestedDates.at(-1)).toBe('2026-09-18');
  expect(container.querySelector('.food-row')?.textContent ?? '').toContain('Lunch from phone');
});

it('ignores a stale response after selecting a different day', async () => {
  let finishToday!: (response: Response) => void;
  vi.stubGlobal('fetch', (input: string) => {
    if (input.endsWith('2026-09-19')) return new Promise<Response>(resolve => { finishToday = resolve; });
    return Promise.resolve(Response.json({ goals, entries: [{ ...lunch, name: 'Yesterday lunch' }] }));
  });
  await mount();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Previous day"]')!.click());
  expect(container.querySelector('.food-row')?.textContent ?? '').toContain('Yesterday lunch');
  await act(async () => finishToday(Response.json({ goals, entries: [lunch] })));
  expect(container.querySelector('.food-row')?.textContent ?? '').toContain('Yesterday lunch');
  expect(container.textContent).not.toContain('Lunch from phone');
});

it('preserves unsaved goal edits when the diary refreshes', async () => {
  await mount();
  const edit = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Edit goals')!;
  await act(async () => edit.click());
  const calories = document.querySelector<HTMLInputElement>('.goal-fields input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(calories, '2000');
    calories.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(calories.value).toBe('2000');
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(calories.value).toBe('2000');
});

it('preserves a failed custom food draft, disables navigation while saving, and logs its serving nutrition as unverified', async () => {
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  let finishCustomSave!: (response: Response) => void;
  let attempts = 0;
  const customFood = { id: 'custom-test', name: 'My dinner bowl', source: 'Community submitted', sourceKind: 'custom', verified: false,
    nutritionBasis: 'serving', servingGrams: null, servingLabel: '1 bowl', calories: 605, protein: 30, carbs: 65, fat: 25 };
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    if (path.startsWith('/api/day')) return Response.json({ goals, entries: [] });
    if (path.startsWith('/api/foods/search')) return Response.json({ foods: [] });
    const body = JSON.parse(String(init?.body));
    requests.push({ path, body });
    if (path === '/api/foods/custom') {
      attempts++;
      return attempts === 1 ? new Promise<Response>(resolve => { finishCustomSave = resolve; }) : Response.json({ food: customFood }, { status: 201 });
    }
    if (path === '/api/entries') return Response.json({ ...customFood, ...body, id: 'entry-test', grams: null, verified: false }, { status: 201 });
    throw new Error(path);
  });
  await mount();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Add food"]')!.click());
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === label);
  expect(button('Add custom food')).toBeDefined();
  await act(async () => button('Add custom food')!.click());
  for (const [label, value] of [['Food name', 'My dinner bowl'], ['Serving description', '1 bowl'], ['Calories (kcal)', '605'], ['Protein (g)', '30'], ['Carbs (g)', '65'], ['Fat (g)', '25']]) {
    const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  await act(async () => button('Save custom food')!.click());
  expect(button('My meals')?.disabled).toBe(true);
  expect(button('Search foods')?.disabled).toBe(true);
  expect([...document.querySelectorAll<HTMLInputElement>('.custom-food-form input')].every(input => input.disabled)).toBe(true);
  expect(button('Back to search')?.disabled).toBe(true);
  await act(async () => finishCustomSave(Response.json({ error: 'Temporary catalog error' }, { status: 503 })));
  expect(document.querySelector('[role=alert]')?.textContent).toBe('Temporary catalog error');
  expect(document.querySelector<HTMLInputElement>('input[aria-label="Food name"]')?.value).toBe('My dinner bowl');
  expect(document.querySelector<HTMLInputElement>('input[aria-label="Calories (kcal)"]')?.value).toBe('605');
  expect(button('Save custom food')?.disabled).toBe(false);
  await act(async () => button('Save custom food')!.click());
  expect(requests[0]).toEqual({ path: '/api/foods/custom', body: { name: 'My dinner bowl', servingLabel: '1 bowl', calories: 605, protein: 30, carbs: 65, fat: 25, servingGrams: null } });
  expect([...document.querySelectorAll<HTMLOptionElement>('select[aria-label=Measure] option')].map(option => option.value)).toEqual(['serving']);
  expect(document.querySelector('.selected-food')?.textContent).toContain('Unverified');
  expect(document.querySelector('.nutrition-preview')?.textContent).toContain('605');
  await act(async () => button('Add to Breakfast')!.click());
  expect(container.querySelector('.food-row')?.textContent).toContain('Unverified');
  expect(container.querySelector('.food-row')?.textContent).toContain('1 × 1 bowl');
  expect(container.querySelector('.food-row')?.textContent).not.toContain('0 g');
});
