'use client';

import { useCallback, useEffect, useState } from 'react';
import { Droplets, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWater, useWaterGoalDraft, type WaterApi } from '@/lib/use-water';
import { waterAmountSchema, waterLabel, waterPresets, waterToMl, waterUnitLabel, type WaterGoal, type WaterUnit } from '@/lib/water';

function WaterGoalEditor({ goal, busy, error, onSave }: { goal: WaterGoal; busy: boolean; error: string | null; onSave: (goal: WaterGoal) => Promise<void> }) {
  const draft = useWaterGoalDraft(goal);
  return <form className="water-goal-form" onSubmit={event => { event.preventDefault(); if (draft.valid) void onSave(draft.goal); }}>
    <label>Water unit<select aria-label="Water unit" value={draft.unit} disabled={busy} onChange={event => draft.changeUnit(event.target.value as WaterUnit)}><option value="ml">mL</option><option value="fl-oz">US fl oz</option></select></label>
    <label>Daily water goal ({waterUnitLabel(draft.unit)})<Input aria-label="Daily water goal" type="number" step="any" value={draft.amount} disabled={busy} onChange={event => draft.changeAmount(event.target.value)} /></label>
    {!draft.valid && <p role="alert">Enter a goal between 1 and 10,000 mL (or the equivalent in US fl oz).</p>}
    {error && <p role="alert" className="water-error">{error}</p>}
    <Button className="confirm-button" disabled={busy || !draft.valid} type="submit">{busy && <Loader2 className="spin" />}Save water goal</Button>
  </form>;
}

export function WaterTracker({ date, authFetch }: { date: string; authFetch: typeof fetch }) {
  const api: WaterApi = useCallback(async <T,>(path: string, options: Parameters<WaterApi>[1] = {}) => {
    const response = await authFetch(path, { method: options.method, signal: options.signal,
      ...(options.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) } : {}) });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data.error || 'Water intake could not be updated.');
    return data as T;
  }, [authFetch]);
  const water = useWater(api, date);
  const { reload } = water;
  const [amount, setAmount] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [reload]);
  const { data } = water;
  const unit = data?.goal.unit ?? 'ml';
  const disabled = water.busy || water.loading || !data;
  const valid = amount.trim() !== '' && waterAmountSchema.safeParse(waterToMl(Number(amount), unit)).success;

  return <section className="water-card" aria-label="Water intake">
    <div className="water-heading"><div><Droplets /><h2>Water intake</h2></div><Button variant="ghost" disabled={disabled} onClick={() => setEditingGoal(true)}>Edit water goal</Button></div>
    {water.error && !editingGoal && <div className="water-error" role="alert">{water.error} <Button variant="ghost" disabled={water.busy} onClick={water.reload}>Try again</Button></div>}
    {!data && water.loading && <p role="status">Loading water intake…</p>}
    {data && <>
      <div className="water-total" aria-live="polite"><strong>{waterLabel(data.totalMl, unit)}</strong><span>of {waterLabel(data.goal.goalMl, unit)}</span></div>
      <div className="water-meter" role="progressbar" aria-label="Water goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(data.totalMl / data.goal.goalMl * 100))} aria-valuetext={`${waterLabel(data.totalMl, unit)} of ${waterLabel(data.goal.goalMl, unit)}`}><span style={{ width: `${Math.min(100, data.totalMl / data.goal.goalMl * 100)}%` }} /></div>
      <p className="water-status">{data.totalMl >= data.goal.goalMl ? 'Water goal reached!' : `${waterLabel(data.goal.goalMl - data.totalMl, unit)} to your daily goal`}</p>
      <div className="water-presets">{waterPresets(unit).map(value => <Button key={value} variant="secondary" disabled={disabled} onClick={() => void water.add(value, unit)}>+ {value} {waterUnitLabel(unit)}</Button>)}</div>
      <form className="water-custom" onSubmit={event => { event.preventDefault(); if (valid) void water.add(Number(amount), unit).then(saved => { if (saved) setAmount(''); }); }}>
        <label htmlFor="water-amount">Custom amount ({waterUnitLabel(unit)})</label>
        <div><Input id="water-amount" type="number" step="any" placeholder={unit === 'ml' ? '350' : '12'} value={amount} disabled={disabled} onChange={event => setAmount(event.target.value)} /><Button type="submit" disabled={disabled || !valid}>Add water</Button></div>
      </form>
      {amount && !valid && <p role="alert" className="water-error">Enter an amount between 1 and 10,000 mL (or the equivalent in US fl oz).</p>}
      {data.entries.length ? <details className="water-log"><summary>Water entries ({data.entries.length})</summary><ul>{data.entries.map(entry => <li key={entry.id}><span>{waterLabel(entry.amountMl, unit)}</span><Button variant="ghost" size="icon" disabled={disabled} aria-label={`Remove ${waterLabel(entry.amountMl, unit)} water`} onClick={() => void water.remove(entry.id)}><Trash2 /></Button></li>)}</ul></details> : <p className="water-status">No water logged for this day yet.</p>}
    </>}
    <Dialog open={editingGoal} onOpenChange={open => { if (!water.busy) setEditingGoal(open); }}><DialogContent className="goal-dialog"><DialogHeader><DialogTitle>Daily water goal</DialogTitle><DialogDescription>Choose your own daily target and preferred unit. Your goal applies across your diary.</DialogDescription></DialogHeader>{data && <WaterGoalEditor goal={data.goal} busy={water.busy} error={water.error} onSave={async goal => { if (await water.saveGoal(goal)) { setAmount(''); setEditingGoal(false); } }} />}</DialogContent></Dialog>
  </section>;
}
