'use client';

import { useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { FoodPicker } from './food-picker';
import { MyMeals } from './my-meals';
import { scaleFood, type Food, type Ingredient } from '@/lib/meals';
import type { EntryInput } from '@/db/store';
import type { FoodApi } from '@/lib/food-api';

type Entry = Omit<EntryInput, 'date'> & { id: string };
export function FoodDialog({ date, initialMeal, authFetch, onClose, onAdded }: {
  date: string; initialMeal: string; authFetch: typeof fetch; onClose: () => void; onAdded: (entry: Entry) => void;
}) {
  const [view, setView] = useState<'search' | 'meals'>('search');
  const [selected, setSelected] = useState<Food | undefined>();
  const [meal, setMeal] = useState(initialMeal);
  const [busy, setBusy] = useState(false);
  const api = useCallback<FoodApi>(async <T,>(path: string, options: Parameters<FoodApi>[1] = {}) => {
    const response = await authFetch(path, { method: options.method, signal: options.signal, ...(options.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error((data as { error?: string } | null)?.error || 'Could not complete this request. Try again.');
    return data as T;
  }, [authFetch]);
  async function add({ food, quantity, unit }: Ingredient) {
    const scaled = scaleFood(food, quantity, unit);
    if (!scaled) return;
    const entry = await api<Entry>('/api/entries', { method: 'POST', body: { date, meal, name: food.name, brand: food.brand, source: food.source, sourceId: food.id, quantity, unit, ...scaled } });
    onAdded(entry);
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="food-dialog"><DialogHeader><DialogTitle>{view === 'meals' ? 'My meals' : 'Add food'}</DialogTitle><DialogDescription>{view === 'meals' ? 'Build a meal, save it, and portion it your way.' : 'Find a food or reuse one of your own meals.'}</DialogDescription></DialogHeader>
    <div className="meal-actions"><Button disabled={busy} variant={view === 'search' ? 'default' : 'outline'} onClick={() => { setSelected(undefined); setView('search'); }}>Search foods</Button><Button disabled={busy} variant={view === 'meals' ? 'default' : 'outline'} onClick={() => setView('meals')}>My meals</Button></div>
    {view === 'meals' ? <MyMeals api={api} onBusy={setBusy} onChoose={food => { setSelected(food); setView('search'); }} /> : <FoodPicker key={selected?.id ?? 'search'} initialFood={selected} api={api} actionLabel={`Add to ${meal}`} onChoose={add} onBusy={setBusy}>
      <label className="meal-field">Meal<select value={meal} disabled={busy} onChange={event => setMeal(event.target.value)}>{['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map(name => <option key={name}>{name}</option>)}</select></label>
    </FoodPicker>}
  </DialogContent></Dialog>;
}
