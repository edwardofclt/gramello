'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus, ScanBarcode, Search } from 'lucide-react';
import { BarcodeScanner } from './barcode-scanner';
import { CustomFoodForm } from './custom-food-form';
import { FoodVerification } from './food-verification';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { nutritionLabel } from '@/lib/food';
import { scaleFood, nutrientKeys, foodUnits, servingQuantity, unitLabels, amountLabels, type AmountUnit, type Food, type Ingredient } from '@/lib/meals';
import type { FoodApi } from '@/lib/food-api';

export function NutritionPreview({ nutrition }: { nutrition: { calories: number; protein: number; carbs: number; fat: number } | null }) {
  return <div className="nutrition-preview">{nutrientKeys.map(key => <div key={key}><strong>{nutrition ? Math.round(nutrition[key]) : '—'}{key !== 'calories' ? 'g' : ''}</strong><span>{key === 'calories' ? 'kcal' : key}</span></div>)}</div>;
}

export function FoodPicker({ api, initialFood, onChoose, actionLabel, children, onBusy }: {
  api: FoodApi; initialFood?: Food; onChoose: (ingredient: Ingredient) => Promise<void> | void;
  actionLabel: string; children?: ReactNode; onBusy?: (busy: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(initialFood ?? null);
  const [mode, setMode] = useState<'search' | 'scan' | 'custom'>('search');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<AmountUnit>('serving');
  const [searching, setSearching] = useState(false);
  const [partial, setPartial] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const scaled = selected ? scaleFood(selected, Number(quantity), unit) : null;
  const choose = useCallback((food: Food) => { setSelected(food); setMode('search'); setSearching(false); setQuantity('1'); setUnit('serving'); setError(null); }, []);
  const lookup = useCallback(async (code: string, signal: AbortSignal) => (await api<{ food: Food }>(`/api/foods/barcode?code=${encodeURIComponent(code)}`, { signal })).food, [api]);
  useEffect(() => {
    if (selected || mode !== 'search' || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      void api<{ foods: Food[]; partial?: boolean; hasMore?: boolean }>(`/api/foods/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) { setResults(data.foods); setPartial(!!data.partial); setHasMore(!!data.hasMore); } })
        .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Food search is unavailable.'); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, query, selected, mode]);
  async function submit() {
    if (!selected || !scaled || lock.current) return;
    lock.current = true; setSaving(true); onBusy?.(true); setError(null);
    try { await onChoose({ food: selected, quantity: Number(quantity), unit }); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save this food.'); }
    finally { lock.current = false; setSaving(false); onBusy?.(false); }
  }
  return <div className="food-picker">
    {error && <p role="alert" className="meal-error">{error}</p>}
    {mode === 'custom' ? <>
      <h3>Add custom food</h3>
      <CustomFoodForm initialName={query} onBusy={busy => { setSaving(busy); onBusy?.(busy); }} onBack={() => setMode('search')} onSaved={choose} submit={async input => (await api<{ food: Food }>('/api/foods/custom', { method: 'POST', body: input })).food} />
    </> : mode === 'scan' ? <BarcodeScanner lookup={lookup} onFound={choose} onBack={() => setMode('search')} /> : selected ? <div className="amount-panel">
      <button className="back-link" disabled={saving} onClick={() => { setSelected(null); setError(null); }}><ChevronLeft />Back to results</button>
      <h3>Choose amount</h3>
      <div className="selected-food">{selected.image ? <img src={selected.image} alt="" /> : <div>{selected.name.charAt(0)}</div>}<section><strong>{selected.name}</strong><span>{selected.brand ?? selected.source} · {selected.servingLabel}</span><FoodVerification verified={selected.verified} />
        {selected.sourceUrl && <a className="nutrition-source" href={selected.sourceUrl} target="_blank" rel="noreferrer">View nutrition source</a>}
      </section></div>
      {children}
      <div className="field-grid">
        <label>Measure<select aria-label="Measure" value={unit} disabled={saving} onChange={event => { const next = event.target.value as AmountUnit; setUnit(next); setQuantity(String(servingQuantity(selected, next))); }}>{foodUnits(selected).map(item => <option key={item} value={item}>{item === 'serving' ? `Servings (${selected.servingLabel})` : item === 'ounces' ? 'Ounces (weight)' : unitLabels[item]}</option>)}</select></label>
        <label>{amountLabels[unit]}<Input type="number" step="any" min="0" value={quantity} disabled={saving} onChange={event => setQuantity(event.target.value)} /></label>
      </div>
      <NutritionPreview nutrition={scaled} />
      {!scaled && <p className="meal-hint">Enter an amount greater than zero.</p>}
      <Button className="confirm-button" disabled={!scaled || saving} onClick={() => void submit()}>{saving && <Loader2 className="spin" />}{actionLabel}</Button>
    </div> : <>
      <div className="search-box"><Search /><Input aria-label="Search foods" autoFocus value={query} onChange={event => { setQuery(event.target.value); setResults([]); setPartial(false); setHasMore(false); setError(null); setSearching(event.target.value.trim().length >= 2); }} placeholder="Try chicken breast, oats, or a brand…" />{searching && <Loader2 className="spin" />}</div>
      <div className="food-actions"><Button variant="outline" onClick={() => { setMode('scan'); setSearching(false); setError(null); }}><ScanBarcode />Scan barcode</Button><Button variant="outline" onClick={() => { setMode('custom'); setSearching(false); setError(null); }}><Plus />Add custom food</Button></div>
      <div className="source-pills"><span>Restaurant menus</span><span>USDA</span><span>Open Food Facts</span><span>Community foods</span></div>
      {partial && <p className="food-notice" role="status">Some nutrition databases are unavailable. Showing available matches from the catalog and other sources.</p>}
      <div className="search-results">{results.map(food => <button className="result-row" key={food.id} onClick={() => choose(food)}>{food.image ? <img src={food.image} alt="" /> : <div className="result-fallback">{food.name.charAt(0)}</div>}<div><strong>{food.name}</strong><span>{food.brand ? `${food.brand} · ` : ''}{food.source}</span><FoodVerification verified={food.verified} /><small>{Math.round(food.calories)} kcal · P {Math.round(food.protein)}g · C {Math.round(food.carbs)}g · F {Math.round(food.fat)}g {nutritionLabel(food)}</small></div><ChevronRight /></button>)}
        {!results.length && !error && <div className="search-empty"><Search /><strong>{searching ? 'Searching food databases…' : query.trim().length < 2 ? 'Find any food' : 'No matches yet'}</strong><span>{query.trim().length < 2 ? 'Search by food, brand, or restaurant.' : 'Try another name, or add a custom food above.'}</span></div>}
        {hasMore && <p className="food-notice">Showing the first 100 matches. Add an item name to narrow your search.</p>}
      </div>
    </>}
  </div>;
}
