'use client';

import { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useEntryEdit } from '../hooks/use-entry-edit';
import { entryMeals } from '../lib/entry-edit';
import { amountLabels, unitLabels, type AmountUnit } from '../lib/meals';
import type { FoodApi } from '../lib/food-api';
import type { DiaryEntry } from './food-dialog';
import { FoodVerification } from './food-verification';
import { NutritionPreview } from './food-picker';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export function EntryDialog({ entry, diaryFetch, onClose, onSaved }: {
  entry: DiaryEntry; diaryFetch: typeof fetch; onClose: () => void; onSaved: (entry: DiaryEntry) => void;
}) {
  const api = useCallback<FoodApi>(async <T,>(path: string, options: Parameters<FoodApi>[1] = {}) => {
    const response = await diaryFetch(path, { method: options.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data?.error || 'Food could not be updated. Try again.');
    return data as T;
  }, [diaryFetch]);
  const edit = useEntryEdit(entry, api, onSaved);
  return <Dialog open onOpenChange={open => { if (!open && !edit.saving) onClose(); }}><DialogContent className="food-dialog"><DialogHeader><DialogTitle>Edit food</DialogTitle><DialogDescription>Update the amount or meal for this logged food.</DialogDescription></DialogHeader>
    <form className="amount-panel" onSubmit={event => { event.preventDefault(); void edit.save(); }}>
      <div className="selected-food"><div>{entry.name.charAt(0)}</div><section><strong>{entry.name}</strong><span>{entry.brand || entry.source}{entry.servingLabel ? ` · ${entry.servingLabel}` : ''}</span><FoodVerification verified={entry.verified}/></section></div>
      {edit.error && <p role="alert" className="food-error">{edit.error}</p>}
      <label className="meal-field">Meal<select value={edit.meal} disabled={edit.saving} onChange={event => edit.setMeal(event.target.value)}>{entryMeals.map(meal => <option key={meal}>{meal}</option>)}</select></label>
      <div className="field-grid">
        <label>Measure<select aria-label="Measure" value={edit.unit} disabled={edit.saving} onChange={event => edit.changeUnit(event.target.value as AmountUnit)}>{edit.units.map(unit => <option key={unit} value={unit}>{unitLabels[unit]}</option>)}</select></label>
        <label>{amountLabels[edit.unit]}<Input aria-label={amountLabels[edit.unit]} autoFocus type="number" step="any" min="0" max="1000000" value={edit.quantity} disabled={edit.saving} onChange={event => edit.setQuantity(event.target.value)} /></label>
      </div>
      <NutritionPreview nutrition={edit.portion}/>
      {!edit.portion && <p className="meal-hint">Enter an amount greater than zero, up to 1,000,000.</p>}
      <div className="meal-actions"><Button type="button" variant="outline" disabled={edit.saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!edit.portion || edit.saving}>{edit.saving && <Loader2 className="spin"/>}Save changes</Button></div>
    </form>
  </DialogContent></Dialog>;
}
