'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { waterAmountSchema, waterGoalSchema, waterNumber, waterToMl, type WaterDay, type WaterGoal, type WaterUnit } from './water';

export type WaterApi = <T>(path: string, options?: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal }) => Promise<T>;
const message = (error: unknown) => error instanceof Error ? error.message : 'Water intake could not be updated.';

export function useWater(api: WaterApi, date: string) {
  const [data, setData] = useState<WaterDay | null>(null);
  const [error, setError] = useState<{ date: string; message: string } | null>(null);
  const [settled, setSettled] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const key = `${date}:${revision}`;
  const lock = useRef(false);
  const read = useRef<AbortController | null>(null);
  const reload = useCallback(() => { if (!lock.current) setRevision(value => value + 1); }, []);

  useEffect(() => {
    const controller = new AbortController();
    read.current = controller;
    api<WaterDay>(`/api/water?date=${date}`, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { setData(result); setError(null); }
    }).catch(error => {
      if (!controller.signal.aborted) setError({ date, message: message(error) });
    }).finally(() => { if (!controller.signal.aborted) setSettled(key); });
    return () => controller.abort();
  }, [api, date, key]);

  async function write(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) {
    if (lock.current) return false;
    lock.current = true; read.current?.abort(); setBusy(true); setError(null);
    try {
      await api(path, { method, body });
      setRevision(value => value + 1);
      return true;
    } catch (error) { setError({ date, message: message(error) }); return false; }
    finally { lock.current = false; setBusy(false); }
  }

  return {
    data: data?.date === date ? data : null, error: error?.date === date ? error.message : null,
    loading: settled !== key, busy, reload,
    add: (amount: number, unit: WaterUnit) => {
      const amountMl = waterToMl(amount, unit);
      return waterAmountSchema.safeParse(amountMl).success ? write('/api/water', 'POST', { date, amountMl }) : Promise.resolve(false);
    },
    remove: (id: string) => write(`/api/water?id=${encodeURIComponent(id)}`, 'DELETE'),
    saveGoal: (goal: WaterGoal) => waterGoalSchema.safeParse(goal).success ? write('/api/water/goals', 'PUT', goal) : Promise.resolve(false),
  };
}

export function useWaterGoalDraft(goal: WaterGoal) {
  const [unit, setUnit] = useState(goal.unit);
  const [goalMl, setGoalMl] = useState(goal.goalMl);
  const [amount, setAmount] = useState(waterNumber(goal.goalMl, goal.unit));
  return {
    unit, amount, goal: { goalMl, unit },
    valid: amount.trim() !== '' && waterAmountSchema.safeParse(goalMl).success,
    changeAmount(value: string) { setAmount(value); setGoalMl(waterToMl(Number(value), unit)); },
    changeUnit(value: WaterUnit) {
      setUnit(value);
      if (Number.isFinite(goalMl)) setAmount(waterNumber(goalMl, value));
    },
  };
}
