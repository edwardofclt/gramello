'use client';

import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus, ScanBarcode, Search } from 'lucide-react';
import { BarcodeScanner } from './barcode-scanner';
import { CustomFoodForm } from './custom-food-form';
import { FoodVerification } from './food-verification';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { nutritionLabel } from '@/lib/food';
import { ServingPicker } from './serving-picker';
import { scaleFood, nutrientKeys, foodUnits, convertFoodQuantity, displayAmount, unitLabels, amountLabels, type AmountUnit, type Food, type Ingredient } from '@/lib/meals';
import type { FoodApi } from '@/lib/food-api';
import { groupSearchHits, searchCategories, searchHits, useFoodSearch } from '@/hooks/use-food-search';
import type { FoodSearchHit } from '@/lib/food-search';

export function NutritionPreview({ nutrition }: { nutrition: { calories: number; protein: number; carbs: number; fat: number } | null }) {
  return <div className="nutrition-preview">{nutrientKeys.map(key => <div key={key}><strong>{nutrition ? Math.round(nutrition[key]) : '—'}{key !== 'calories' ? 'g' : ''}</strong><span>{key === 'calories' ? 'kcal' : key}</span></div>)}</div>;
}

export function FoodPicker({ api, initialFood, onChoose, actionLabel, children, onBusy }: {
  api: FoodApi; initialFood?: Food; onChoose: (ingredient: Ingredient) => Promise<void> | void;
  actionLabel: string; children?: ReactNode; onBusy?: (busy: boolean) => void;
}) {
  const search = useFoodSearch(api);
  const { query, setQuery, results: searchResult, busy: searching, pause } = search;
  const { partial, issues = [] } = searchResult;
  const resultsRef = useRef<HTMLDivElement>(null);
  const scrollOffset = useRef(0);
  const refreshOnBack = useRef(false);
  const restoreResults = useCallback((element: HTMLDivElement | null) => { resultsRef.current = element; if (element) { const restore = () => { if (element.isConnected && resultsRef.current === element) (element.closest<HTMLElement>('.food-dialog') ?? element).scrollTop = scrollOffset.current; }; restore(); requestAnimationFrame(restore); } }, []);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Food | null>(initialFood ?? null);
  const [mode, setMode] = useState<'search' | 'scan' | 'custom'>('search');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<AmountUnit>('serving');
  const [showSearchDetails, setShowSearchDetails] = useState(false);
  const searchDetailsId = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const picker = useRef<HTMLDivElement>(null);
  const page = selected ? 'amount' : mode;
  useLayoutEffect(() => { if (page !== 'search') { const dialog = picker.current?.closest('[role="dialog"]'); if (dialog) dialog.scrollTop = 0; } }, [page]);
  const scaled = selected ? scaleFood(selected, Number(quantity), unit) : null;
  const choose = useCallback((food: Food) => { pause(); scrollOffset.current = resultsRef.current?.closest<HTMLElement>('.food-dialog')?.scrollTop ?? resultsRef.current?.scrollTop ?? scrollOffset.current; setSelected(food); setMode('search'); setQuantity('1'); setUnit('serving'); setError(null); }, [pause]);
  const lookup = useCallback(async (code: string, signal: AbortSignal) => (await api<{ food: Food }>(`/api/foods/barcode?code=${encodeURIComponent(code)}`, { signal })).food, [api]);
  async function submit() {
    if (!selected || !scaled || lock.current) return;
    lock.current = true; setSaving(true); onBusy?.(true); setError(null);
    try { await onChoose({ food: selected, quantity: Number(quantity), unit }); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save this food.'); }
    finally { lock.current = false; setSaving(false); onBusy?.(false); }
  }
  return <div className="food-picker" ref={picker}>
    {error && <p role="alert" className="meal-error">{error}</p>}
    {mode === 'custom' ? <>
      <h3>Add custom food</h3>
      <CustomFoodForm initialName={query} onBusy={busy => { setSaving(busy); onBusy?.(busy); }} onBack={() => setMode('search')} onSaved={food => { refreshOnBack.current = true; choose(food); }} submit={async input => (await api<{ food: Food }>('/api/foods/custom', { method: 'POST', body: input })).food} />
    </> : mode === 'scan' ? <BarcodeScanner lookup={lookup} onFound={food => { refreshOnBack.current = true; choose(food); }} onBack={() => setMode('search')} /> : selected ? <div className="amount-panel">
      <button className="back-link" disabled={saving} onClick={() => { if (error?.startsWith('This food changed')) scrollOffset.current = 0; if (refreshOnBack.current || error?.startsWith('This food changed')) { refreshOnBack.current = false; search.retry(); } setSelected(null); setError(null); }}><ChevronLeft />{error?.startsWith('This food changed') ? 'Back and refresh results' : 'Back to results'}</button>
      <h3>Choose amount</h3>
      <div className="selected-food">{selected.image ? <img src={selected.image} crossOrigin="anonymous" alt="" /> : <div>{selected.name.charAt(0)}</div>}<section><strong>{selected.name}</strong><span>{selected.brand ?? selected.source} · {selected.servingLabel}</span><FoodVerification verified={selected.verified} />
        {selected.sourceUrl && <a className="nutrition-source" href={selected.sourceUrl} target="_blank" rel="noreferrer">View nutrition source</a>}
      </section></div>
      {children}
      {unit === 'serving' && <ServingPicker food={selected} disabled={saving} onChange={food => { setSelected(food); setError(null); }} />}
      <div className="field-grid">
        <label>Measure<select aria-label="Measure" value={unit} disabled={saving} onChange={event => { const next = event.target.value as AmountUnit; setQuantity(String(convertFoodQuantity(selected, Number(quantity), unit, next))); setUnit(next); }}>{foodUnits(selected).map(item => <option key={item} value={item}>{item === 'serving' ? `Servings (${selected.servingLabel})` : item === 'ounces' ? 'Ounces (weight)' : unitLabels[item]}</option>)}</select></label>
        <label>{amountLabels[unit]}<Input type="number" step="any" min="0" value={quantity} disabled={saving} onChange={event => setQuantity(event.target.value)} /></label>
      </div>
      {unit === 'serving' && scaled && <p className="meal-hint" role="status">{displayAmount(Number(quantity))} × {selected.servingLabel}{scaled.grams !== null ? ` = ${displayAmount(scaled.grams)} g total` : selected.servingMl ? ` = ${displayAmount(Number(quantity) * selected.servingMl)} mL total` : ''}</p>}
      <NutritionPreview nutrition={scaled} />
      {!scaled && <p className="meal-hint">Enter an amount greater than zero.</p>}
      <Button className="confirm-button" disabled={!scaled || saving} onClick={() => void submit()}>{saving && <Loader2 className="spin" />}{actionLabel}</Button>
    </div> : <>
      <form className="food-search-form" onSubmit={event => { event.preventDefault(); search.submitSearch(); }}>
        <div className="search-box"><Search /><Input aria-label="Search foods" autoFocus={!query} maxLength={200} value={query} onChange={event => { setQuery(event.target.value); scrollOffset.current = 0; setShowSearchDetails(false); setError(null); }} placeholder="Try chicken breast, oats, or a brand…" />{searching && <Loader2 className="spin" aria-hidden="true" />}</div>
      </form>
      <div className="food-actions"><Button variant="outline" onClick={() => { search.pause(); scrollOffset.current = resultsRef.current?.closest<HTMLElement>('.food-dialog')?.scrollTop ?? resultsRef.current?.scrollTop ?? 0; setMode('scan'); setError(null); }}><ScanBarcode />Scan barcode</Button><Button variant="outline" onClick={() => { search.pause(); scrollOffset.current = resultsRef.current?.closest<HTMLElement>('.food-dialog')?.scrollTop ?? resultsRef.current?.scrollTop ?? 0; setMode('custom'); setError(null); }}><Plus />Add custom food</Button></div>
      <div className="search-filters" role="group" aria-label="Food categories">{searchCategories.map(([value, label]) => <button type="button" key={value} aria-pressed={search.category === value} onClick={() => { search.setCategory(value); scrollOffset.current = 0; }}>{label === 'Custom' ? 'My foods' : label}</button>)}</div>
      {(search.brand || !!searchResult.brands?.length) && <label className="search-brand">Brand or restaurant<select aria-label="Brand or restaurant" value={search.brand} onChange={event => { scrollOffset.current = 0; search.setBrand(event.target.value); }}><option value="">All brands and restaurants</option>{Array.from(new Set([...(searchResult.brands ?? []), ...(search.brand ? [search.brand] : [])])).map(brand => <option key={brand} value={brand}>{brand}</option>)}</select></label>}
      {(search.category !== 'all' || search.brand) && <button type="button" className="search-text-action" onClick={() => { scrollOffset.current = 0; search.clearFilters(); }}>Clear filters</button>}
      {searchResult.correction && <p className="food-notice">Also searching for “{searchResult.correction}”. <button type="button" className="search-text-action" onClick={() => setQuery(searchResult.correction!)}>Use this spelling</button></p>}
      {search.error && <div role="alert" className="food-notice">{search.error} <button type="button" className="search-text-action" onClick={search.retry}>Retry search</button></div>}
      {search.notice && <p role="status" className="food-notice">{search.notice}</p>}
      {searching && <p className="search-guidance" role="status">Finding more matches…</p>}
      {partial && <div className="food-notice" role="status">
        <button type="button" className="food-notice-toggle" aria-label="Some nutrition databases are unavailable." aria-expanded={showSearchDetails} aria-controls={searchDetailsId} onClick={() => setShowSearchDetails(value => !value)}>
          <span>Some nutrition databases are unavailable.<small>{showSearchDetails ? 'Hide details' : 'Show details'}</small></span><ChevronRight aria-hidden="true" />
        </button>
        <div id={searchDetailsId} className="food-notice-details" hidden={!showSearchDetails}>
          {issues.length ? <ul>{issues.map(issue => <li key={issue.source}><strong>{issue.source}: </strong>{issue.message}</li>)}</ul> : <p>The search service did not provide details about which databases failed. Try searching again.</p>}
          <p>Showing available matches from the catalog and other sources. You can still choose a result or add a custom food.</p>
        </div>
      </div>}
      {searchResult.sourceStatus?.filter(status => status.message && (status.state !== 'unavailable' || !issues.some(issue => issue.source === status.source))).map(status => <p key={status.source} className="search-guidance" role="status">{status.source}: {status.message}</p>)}
      <div className="search-results" ref={restoreResults}>
        <FoodSearchRows hits={searchHits(searchResult)} onChoose={choose} expanded={expandedGroups} onExpand={key => setExpandedGroups(previous => ({ ...previous, [key]: !previous[key] }))} />
        {!searchResult.foods.length && !searching && <div className="search-empty"><Search /><strong>{!search.validQuery ? 'Find any food' : search.category !== 'all' || search.brand ? 'No matches with these filters' : 'No matches yet'}</strong><span>{!search.validQuery ? 'Enter at least two characters. Search by food, brand, or restaurant.' : 'Try a shorter name, check the spelling, or add a custom food.'}</span></div>}
        {searchResult.nextCursor && <Button variant="outline" className="search-continuation" disabled={searching === 'local' || searching === 'more'} onClick={() => void search.loadMore()}>{searching === 'more' && <Loader2 className="spin" />}Load more</Button>}
        {!searchResult.nextCursor && search.canExpand && <Button variant="outline" className="search-continuation" disabled={searching === 'local' || searching === 'more'} onClick={() => void search.findMore()}>{searching === 'more' && <Loader2 className="spin" />}Find more matches</Button>}
        {!searchResult.nextCursor && searchResult.hasMore && !search.canExpand && <p className="food-notice">Refine your search by preparation, brand, or restaurant for more precise matches.</p>}
      </div>
    </>}
  </div>;
}

function FoodSearchRows({ hits, onChoose, expanded, onExpand }: { hits: FoodSearchHit[]; onChoose: (food: Food) => void; expanded: Record<string, boolean>; onExpand: (key: string) => void }) {
  const row = (hit: FoodSearchHit) => { const food = hit.food; return <button className="result-row" key={food.id} onClick={() => onChoose(food)}>{food.image ? <img src={food.image} crossOrigin="anonymous" alt="" /> : <div className="result-fallback">{food.name.charAt(0)}</div>}<div><strong>{food.name}</strong><span>{food.brand ? `${food.brand} · ` : ''}{food.source}</span><span>Serving: {food.servingLabel}</span><FoodVerification verified={food.verified} /><small>{Math.round(food.calories)} kcal · P {Math.round(food.protein)}g · C {Math.round(food.carbs)}g · F {Math.round(food.fat)}g {nutritionLabel(food)}</small>{hit.warning && <small className="search-metadata-warning">{hit.warning}</small>}</div><ChevronRight /></button>; };
  return groupSearchHits(hits).map(group => group.hits.length > 1 ? <details key={group.key} className="search-variants" open={!!expanded[group.key]}><summary aria-expanded={!!expanded[group.key]} onClick={event => { event.preventDefault(); onExpand(group.key); }}>{group.label ?? group.hits[0].food.name} · {group.hits.length} variants — choose preparation or size</summary>{group.hits.map(row)}</details> : row(group.hits[0]));
}
