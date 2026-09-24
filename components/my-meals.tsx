'use client';

import { unitHint } from '@/lib/meals';
import { useRef, useState } from 'react';
import { ChevronLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { FoodPicker, NutritionPreview } from './food-picker';
import { ServingPicker } from './serving-picker';
import { useMealDraft } from '@/hooks/use-meal-draft';
import { useMealLibrary } from '@/hooks/use-meal-library';
import { displayAmount, GRAMS_PER_OUNCE, mealFood, scaleFood, summarizeMeal, type CustomMeal, type Food } from '@/lib/meals';
import type { FoodApi } from '@/lib/food-api';

export function MyMeals({ api, onChoose, onBusy }: { api: FoodApi; onChoose: (food: Food) => void; onBusy: (busy: boolean) => void }) {
  const library = useMealLibrary(api);
  const [editing, setEditing] = useState<CustomMeal | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  if (editing) return <MealEditor api={api} initial={editing === 'new' ? undefined : editing} onBusy={onBusy} onBack={() => setEditing(null)} onSaved={() => { setEditing(null); library.reload(); setNotice('Meal saved. Choose it below to log any portion.'); }} />;
  return <div className="meal-builder">
    <Button onClick={() => { setNotice(''); setEditing('new'); }}><Plus />Create meal</Button>
    <p className="meal-hint">Combine ingredients once, then log any portion. Your meals are saved in this browser’s diary.</p>
    {notice && <p role="status" className="meal-hint">{notice}</p>}
    <Input aria-label="Search my meals" placeholder="Search my meals…" value={filter} onChange={event => setFilter(event.target.value)} />
    {library.error && <div role="alert" className="meal-error">{library.error}<Button variant="outline" onClick={library.reload}>Try again</Button></div>}
    {library.loading ? <p><Loader2 className="spin" />Loading your meals…</p> : library.meals.length === 0 ? <div className="search-empty"><strong>Your recipes, ready to reuse</strong><span>Create your first meal from foods you already use.</span></div> : library.meals.filter(meal => meal.name.toLowerCase().includes(filter.toLowerCase())).map(meal => {
      const summary = summarizeMeal(meal);
      return <article className="saved-meal" key={meal.id}>
        <button className="saved-meal-choice" disabled={library.deleting} onClick={() => onChoose(mealFood(meal))}><strong>{meal.name}</strong><span>{meal.ingredients.length} ingredients · {Math.round(summary.totals.calories)} kcal per batch</span><span>{displayAmount(summary.servings)} portions · {Math.round(summary.portion.calories)} kcal each</span></button>
        <div className="meal-actions"><Button variant="outline" disabled={library.deleting} onClick={() => { setNotice(''); setEditing(meal); }}>Edit {meal.name}</Button><Button variant="ghost" aria-label={`Delete ${meal.name}`} disabled={library.deleting} onClick={() => setConfirmDelete(meal.id)}><Trash2 /></Button></div>
        {confirmDelete === meal.id && <div className="meal-delete"><p>Delete this saved meal? Previously logged portions stay in your diary.</p><div className="meal-actions"><Button variant="destructive" disabled={library.deleting} onClick={async () => { onBusy(true); try { if (await library.remove(meal.id)) setConfirmDelete(null); } finally { onBusy(false); } }}>Delete meal</Button><Button variant="outline" disabled={library.deleting} onClick={() => setConfirmDelete(null)}>Keep meal</Button></div></div>}
      </article>;
    })}
  </div>;
}

function MealEditor({ api, initial, onSaved, onBack, onBusy }: { api: FoodApi; initial?: CustomMeal; onSaved: () => void; onBack: () => void; onBusy: (busy: boolean) => void }) {
  const draft = useMealDraft(initial);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function save() {
    if (!draft.valid || !draft.input || lock.current) return;
    lock.current = true; setSaving(true); onBusy(true); setError(null);
    try { await api(`/api/meals${initial ? `?id=${encodeURIComponent(initial.id)}` : ''}`, { method: initial ? 'PUT' : 'POST', body: draft.input }); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Meal could not be saved.'); }
    finally { lock.current = false; setSaving(false); onBusy(false); }
  }
  if (adding) return <div className="meal-builder"><button className="back-link" disabled={pickerBusy} onClick={() => setAdding(false)}><ChevronLeft />Back to meal</button><h3>Add ingredient</h3><FoodPicker api={api} onBusy={busy => { setPickerBusy(busy); onBusy(busy); }} actionLabel="Add ingredient" onChoose={ingredient => { draft.setIngredients(items => [...items, ingredient]); setAdding(false); }} /></div>;
  const summary = draft.summary;
  const requiresWeight = draft.ingredients.some(item => scaleFood(item.food, item.quantity, item.unit)?.grams == null);
  return <div className="meal-builder">
    <button className="back-link" disabled={saving} onClick={onBack}><ChevronLeft />Back to my meals</button>
    <h3>{initial ? 'Edit meal' : 'Create meal'}</h3>
    <label className="meal-field">Meal name<Input value={draft.name} maxLength={150} disabled={saving} onChange={event => draft.setName(event.target.value)} placeholder="Beef & vegetable soup" /></label>
    <section className="meal-builder"><h4>Ingredients</h4>
      {draft.ingredients.map((ingredient, index) => <div className="ingredient-row" key={index}>
        <div><strong>{ingredient.food.name}</strong><span>{ingredient.unit === 'serving' ? ingredient.food.servingLabel : unitHint(ingredient.unit)}</span>
          {ingredient.unit === 'serving' && <ServingPicker food={ingredient.food} disabled={saving} onChange={food => draft.setIngredients(items => items.map((item, i) => i === index ? { ...item, food } : item))} />}
        </div>
        <Input aria-label={`Amount of ${ingredient.food.name}`} type="number" min="0" step="any" disabled={saving} value={ingredient.amountText ?? String(ingredient.quantity)} onChange={event => draft.setIngredients(items => items.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value), amountText: event.target.value } : item))} />
        <Button variant="ghost" aria-label={`Remove ingredient ${ingredient.food.name}`} disabled={saving} onClick={() => draft.setIngredients(items => items.filter((_, i) => i !== index))}><Trash2 /></Button>
      </div>)}
      <Button variant="outline" disabled={saving || draft.ingredients.length >= 100} onClick={() => setAdding(true)}><Plus />Add ingredient</Button>
    </section>
    <section className="meal-builder"><h4>Batch weight</h4>
      {!requiresWeight && <p className="meal-hint">Estimated from ingredients: {displayAmount(draft.estimatedGrams)} g ({displayAmount(draft.estimatedGrams / GRAMS_PER_OUNCE)} oz). For more accurate portions, weigh the finished meal without its container. Cooking can change the weight.</p>}
      {requiresWeight && <p className="meal-hint">Enter the finished batch weight because an ingredient’s weight is unknown.</p>}
      <div className="field-grid"><label>Finished batch weight{requiresWeight ? ' (required)' : ' (optional)'}<Input type="number" step="any" min="0" placeholder={requiresWeight ? "Enter measured weight" : "Use ingredient estimate"} disabled={saving} value={draft.weight} onChange={event => draft.setWeight(event.target.value)} /></label><label>Batch weight unit<select value={draft.weightUnit} disabled={saving} onChange={event => { const next = event.target.value as 'grams' | 'ounces'; if (draft.weight.trim()) draft.setWeight(String(Number(draft.weight) * (next === 'ounces' ? 1 / GRAMS_PER_OUNCE : GRAMS_PER_OUNCE))); draft.setWeightUnit(next); }}><option value="grams">Grams</option><option value="ounces">Ounces (weight)</option></select></label></div>
    </section>
    <section className="meal-builder"><h4>Plan your portions</h4>
      <div className="field-grid"><label>Portion by<select disabled={saving} value={draft.portionUnit} onChange={event => { draft.setPortionUnit(event.target.value as 'servings' | 'grams' | 'ounces'); draft.setPortion(''); }}><option value="servings">Number of equal servings</option><option value="grams">Grams per portion</option><option value="ounces">Ounces per portion</option></select></label><label>{draft.portionUnit === 'servings' ? 'Number of servings' : draft.portionUnit === 'grams' ? 'Grams per portion' : 'Ounces per portion'}<Input disabled={saving} type="number" step="any" min="0" value={draft.portion} onChange={event => draft.setPortion(event.target.value)} /></label></div>
      {summary && <div className="batch-summary" aria-live="polite"><p><strong>Whole batch · {Math.round(summary.totals.calories)} kcal</strong></p><p>P {displayAmount(summary.totals.protein)} g · C {displayAmount(summary.totals.carbs)} g · F {displayAmount(summary.totals.fat)} g</p><p>{displayAmount(summary.totalGrams)} g / {displayAmount(summary.totalGrams / GRAMS_PER_OUNCE)} oz{draft.weight.trim() ? ' finished weight' : ' estimated weight'}</p><p>Makes {displayAmount(summary.servings)} portions of {displayAmount(draft.input!.servingGrams)} g / {displayAmount(draft.input!.servingGrams / GRAMS_PER_OUNCE)} oz each.</p></div>}
      <p className="meal-hint">Per portion · choose a different amount any time you log this meal.</p>
      <NutritionPreview nutrition={summary?.portion ?? null} />
      <p className="meal-hint">Ounces measure weight, not fluid volume. Nutrition assumes the ingredients are evenly distributed.</p>
    </section>
    {error && <p role="alert" className="meal-error">{error}</p>}
    {!draft.valid && <p className="meal-hint">Add a name, at least one ingredient, and positive amounts to save.</p>}
    <Button className="confirm-button" disabled={saving || !draft.valid} onClick={() => void save()}>{saving && <Loader2 className="spin" />}Save meal</Button>
  </div>;
}
