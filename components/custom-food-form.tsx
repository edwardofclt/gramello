'use client';
import { useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { customFoodFields, customFoodInput, emptyCustomFood } from '@/lib/custom-food-form';
import type { CustomFoodInput, Food } from '@/lib/food';

export function CustomFoodForm({ initialName, submit, onSaved, onBack, onBusy }: {
  initialName: string; submit: (input: CustomFoodInput) => Promise<Food>; onSaved: (food: Food) => void; onBack: () => void; onBusy: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => emptyCustomFood(initialName));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    let input;
    try { input = customFoodInput(draft); }
    catch { setError('Enter a name, serving description, and all four nutrition values. Use zero when the amount is zero. Optional weight must be greater than zero.'); return; }
    lock.current = true; setSaving(true); onBusy(true); setError('');
    try { onSaved(await submit(input)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Your food could not be saved. Try again.'); }
    finally { lock.current = false; setSaving(false); onBusy(false); }
  }
  return <form className="custom-food-form" onSubmit={event => { event.preventDefault(); void save(); }} noValidate>
    <button type="button" className="back-link" onClick={onBack} disabled={saving}>Back to search</button>
    <p>Enter the total nutrition for <strong>one serving</strong> as described below. This food will be searchable by everyone and labeled <strong>Unverified</strong>.</p>
    <div className="custom-food-fields">{customFoodFields.map(([key, label, type]) => <label key={key} className={type === 'text' ? 'wide' : ''}>
      <span>{label}</span><Input aria-label={label} type={type} min={key === 'servingGrams' ? '0.01' : '0'} step="any" disabled={saving}
        maxLength={key === 'name' ? 200 : 120} value={draft[key]} autoFocus={key === 'name'}
        placeholder={key === 'servingLabel' ? 'e.g. 1 bowl or 2 slices' : key === 'servingGrams' ? 'Leave blank if unknown' : type === 'number' ? '0' : undefined}
        onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/>
    </label>)}</div>
    {error && <p className="food-error" role="alert">{error}</p>}
    <Button className="confirm-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save custom food'}</Button>
  </form>;
}
