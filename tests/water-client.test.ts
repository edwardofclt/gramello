// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWater, useWaterGoalDraft, type WaterApi } from '../lib/use-water';
import { defaultWaterGoal, type WaterDay } from '../lib/water';

let root: Root;
let container: HTMLDivElement;
let tracker: ReturnType<typeof useWater>;
function Harness({ api, date }: { api: WaterApi; date: string }) {
  const value = useWater(api, date);
  useEffect(() => { tracker = value; });
  return null;
}
const day = (date: string, totalMl = 0): WaterDay => ({ date, totalMl, entries: [], goal: defaultWaterGoal });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it('ignores a late day response after navigation and refreshes the selected date', async () => {
  const old = deferred<WaterDay>();
  const request = vi.fn((path: string) => path.endsWith('2026-09-19') ? old.promise : Promise.resolve(day('2026-09-18', 250)));
  const api = request as WaterApi;
  await act(async () => root.render(createElement(Harness, { api, date: '2026-09-19' })));
  await act(async () => root.render(createElement(Harness, { api, date: '2026-09-18' })));
  expect(tracker.data?.totalMl).toBe(250);
  await act(async () => old.resolve(day('2026-09-19', 999)));
  expect(tracker.data?.date).toBe('2026-09-18');
  await act(async () => tracker.reload());
  expect(request).toHaveBeenLastCalledWith('/api/water?date=2026-09-18', expect.anything());
});

it('locks duplicate taps and leaves totals unchanged on failure, then allows retry', async () => {
  const pending = deferred<unknown>();
  let first = true;
  let total = 0;
  const request = vi.fn(async (_path: string, options?: Parameters<WaterApi>[1]) => {
    if (options?.method === 'POST') {
      if (first) { first = false; await pending.promise; throw new Error('Save failed'); }
      total += (options.body as { amountMl: number }).amountMl;
      return {};
    }
    return day('2026-09-19', total);
  });
  await act(async () => root.render(createElement(Harness, { api: request as WaterApi, date: '2026-09-19' })));
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = tracker.add(16, 'fl-oz');
    expect(await tracker.add(16, 'fl-oz')).toBe(false);
    tracker.reload();
  });
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  expect(tracker.busy).toBe(true);
  await act(async () => { pending.resolve({}); expect(await saving).toBe(false); });
  expect(tracker.error).toBe('Save failed');
  expect(tracker.data?.totalMl).toBe(0);
  expect(tracker.busy).toBe(false);
  await act(async () => { expect(await tracker.add(16, 'fl-oz')).toBe(true); });
  expect(tracker.data?.totalMl).toBeCloseTo(473.176473, 6);
});

it('changing goal display units never rounds the stored goal unless the amount is edited', async () => {
  let draft!: ReturnType<typeof useWaterGoalDraft>;
  function GoalHarness() {
    const value = useWaterGoalDraft({ goalMl: 2000, unit: 'ml' });
    useEffect(() => { draft = value; });
    return null;
  }
  await act(async () => root.render(createElement(GoalHarness)));
  await act(async () => draft.changeUnit('fl-oz'));
  expect(draft.amount).toBe('67.6');
  expect(draft.goal.goalMl).toBe(2000);
  await act(async () => draft.changeUnit('ml'));
  expect(draft.amount).toBe('2000');
  await act(async () => draft.changeAmount(''));
  expect(draft.valid).toBe(false);
  await act(async () => draft.changeUnit('fl-oz'));
  await act(async () => draft.changeAmount('64'));
  expect(draft.goal.goalMl).toBeCloseTo(1892.705892, 6);
});
