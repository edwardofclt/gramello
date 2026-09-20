'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus, ScanBarcode, Search } from 'lucide-react';
import { BarcodeScanner } from './barcode-scanner';
import { CustomFoodForm } from './custom-food-form';
import { FoodVerification } from './food-verification';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { nutritionLabel, scaleFood, type Food } from '@/lib/food';
import type { EntryInput } from '@/db/store';

export type DiaryEntry = EntryInput & { id: string };
const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
export function FoodDialog({ date, initialMeal, authFetch, onClose, onAdded }: {
  date: string; initialMeal: string; authFetch: typeof fetch; onClose: () => void; onAdded: (entry: DiaryEntry) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const [partial, setPartial] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Food | null>(null);
  const [mode, setMode] = useState<'search' | 'scan' | 'custom'>('search');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<'serving' | 'grams'>('serving');
  const [meal, setMeal] = useState(initialMeal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const scaled = selected ? scaleFood(selected, Number(quantity), unit) : null;
  const select = useCallback((food: Food) => { setSelected(food); setMode('search'); setUnit('serving'); setQuantity('1'); setError(''); }, []);
  const lookupBarcode = useCallback(async (code: string, signal: AbortSignal) => {
    const response = await authFetch(`/api/foods/barcode?code=${encodeURIComponent(code)}`, { signal });
    const data = await response.json() as { food: Food; error?: string };
    if (!response.ok) throw new Error(data.error || 'Barcode lookup unavailable.');
    return data.food;
  }, [authFetch]);
  useEffect(() => {
    if (mode !== 'search' || selected || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true); setError('');
      try {
        const response = await authFetch(`/api/foods/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const data = await response.json() as { foods: Food[]; partial?: boolean; hasMore?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error || 'Food search is unavailable.');
        if (!controller.signal.aborted) { setResults(data.foods); setPartial(!!data.partial); setHasMore(!!data.hasMore); }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Food search is unavailable.'); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [authFetch, query, mode, selected]);
  async function add() {
    if (!selected || !scaled || lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const body = { date, meal, sourceId: selected.id, name: selected.name, brand: selected.brand, source: selected.source, quantity: Number(quantity), unit, ...scaled };
      const response = await authFetch('/api/entries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json() as DiaryEntry & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not add food.');
      onAdded(data);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not add food.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="food-dialog"><DialogHeader>
    <DialogTitle>{selected ? 'Choose amount' : mode === 'custom' ? 'Add custom food' : mode === 'scan' ? 'Scan barcode' : 'Add food'}</DialogTitle>
    <DialogDescription>{selected ? 'Adjust your portion before adding it to your diary.' : mode === 'custom' ? 'Save a food to the shared catalog for next time.' : 'Search foods, restaurants, and community submissions.'}</DialogDescription>
  </DialogHeader>
  {error && <p className="food-error" role="alert">{error}</p>}
  {mode === 'custom' ? <CustomFoodForm initialName={query} onBusy={setSaving} onBack={() => setMode('search')} onSaved={select} submit={async input => {
    const response = await authFetch('/api/foods/custom', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const data = await response.json() as { food: Food; error?: string };
    if (!response.ok) throw new Error(data.error || 'Your food could not be saved.');
    return data.food;
  }}/>
  : mode === 'scan' ? <BarcodeScanner lookup={lookupBarcode} onFound={select} onBack={() => setMode('search')}/>
  : !selected ? <>
    <div className="search-box"><Search/><Input aria-label="Search foods" autoFocus value={query} onChange={event => { setQuery(event.target.value); setResults([]); setPartial(false); setHasMore(false); setSearching(event.target.value.trim().length >= 2); setError(''); }} placeholder="Try chicken breast, oats, or a brand…"/>{searching && <Loader2 className="spin"/>}</div>
    <div className="food-actions"><Button variant="outline" onClick={() => setMode('scan')}><ScanBarcode/>Scan barcode</Button><Button variant="outline" onClick={() => setMode('custom')}><Plus/>Add custom food</Button></div>
    <div className="source-pills"><span>Restaurant menus</span><span>USDA</span><span>Open Food Facts</span><span>Community foods</span></div>
    {partial && <p className="food-notice" role="status">Some nutrition databases are unavailable. Showing available matches from the catalog and other sources.</p>}
    <div className="search-results">
      {query.trim().length < 2 ? <div className="search-empty"><Search/><strong>Find your next bite</strong><span>Search by food, brand, or restaurant.</span></div>
      : searching && !results.length ? <div className="search-empty"><Loader2 className="spin"/><span>Searching food databases…</span></div>
      : !results.length && !error ? <div className="search-empty"><strong>No matches yet</strong><span>Try another name, or add a custom food above.</span></div>
      : results.map(food => <button className="result-row" key={food.id} onClick={() => select(food)}>
        {food.image ? <img src={food.image} alt=""/> : <div className="result-fallback">{food.name.charAt(0)}</div>}
        <div><strong>{food.name}</strong><span>{food.brand ? `${food.brand} · ` : ''}{food.source}</span><FoodVerification verified={food.verified}/><small>{Math.round(food.calories)} kcal · P {Math.round(food.protein)}g · C {Math.round(food.carbs)}g · F {Math.round(food.fat)}g {nutritionLabel(food)}</small></div><ChevronRight/>
      </button>)}
      {hasMore && <p className="food-notice">Showing the first 100 matches. Add an item name to narrow your search.</p>}
    </div>
  </> : <div className="amount-panel">
    <button className="back-link" disabled={saving} onClick={() => { setSelected(null); setError(''); }}><ChevronLeft/>Back to results</button>
    <div className="selected-food"><div>{selected.name.charAt(0)}</div><section><strong>{selected.name}</strong><span>{selected.brand ?? selected.source}</span><FoodVerification verified={selected.verified}/>
      {selected.sourceUrl && <a className="nutrition-source" href={selected.sourceUrl} target="_blank" rel="noreferrer">View nutrition source</a>}</section></div>
    <div className="field-grid"><label>Meal<Select value={meal} onValueChange={value => value && setMeal(value)} disabled={saving}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{meals.map(value => <SelectItem value={value} key={value}>{value}</SelectItem>)}</SelectContent></Select></label>
      <label>Measure<Select value={unit} onValueChange={value => { if (value) { setUnit(value as 'serving' | 'grams'); setQuantity(value === 'grams' ? String(selected.servingGrams ?? 100) : '1'); } }} disabled={saving}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="serving">Serving ({selected.servingLabel})</SelectItem>{selected.servingGrams !== null && <SelectItem value="grams">Grams</SelectItem>}</SelectContent></Select></label></div>
    <label className="quantity-label">{unit === 'grams' ? 'Weight' : 'Servings'}<div className="quantity-control"><button aria-label="Decrease amount" disabled={saving} onClick={() => setQuantity(String(Math.max(unit === 'grams' ? 1 : .25, Number(quantity) - (unit === 'grams' ? 5 : .25))))}><Minus/></button>
      <Input aria-label={unit === 'grams' ? 'Weight in grams' : 'Servings'} type="number" min="0" step="any" value={quantity} disabled={saving} onChange={event => setQuantity(event.target.value)}/><span>{unit === 'grams' ? 'g' : 'servings'}</span><button aria-label="Increase amount" disabled={saving} onClick={() => setQuantity(String(Number(quantity) + (unit === 'grams' ? 5 : .25)))}><Plus/></button></div></label>
    <div className="nutrition-preview">{(['calories','protein','carbs','fat'] as const).map(key => <div key={key}><strong>{scaled ? Math.round(scaled[key]) : '—'}{key !== 'calories' && 'g'}</strong><span>{key}</span></div>)}</div>
    <Button className="confirm-button" onClick={() => void add()} disabled={saving || !scaled}>{saving ? <Loader2 className="spin"/> : <Plus/>}Add to {meal}</Button>
  </div>}
  </DialogContent></Dialog>;
}
