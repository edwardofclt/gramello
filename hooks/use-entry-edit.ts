import { useRef, useState } from 'react';
import { editedPortion, entryUnits, type EntrySnapshot } from '../lib/entry-edit';
import { GRAMS_PER_OUNCE, ML_PER_FLUID_OUNCE, type AmountUnit } from '../lib/food';
import type { FoodApi } from '../lib/food-api';

export function useEntryEdit<T extends EntrySnapshot & { id: string; meal: string }>(entry: T, api: FoodApi, onSaved: (entry: T) => void) {
  const [quantity, setQuantity] = useState(String(entry.quantity));
  const [unit, setUnit] = useState(entry.unit as AmountUnit);
  const [meal, setMeal] = useState(entry.meal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const portion = editedPortion(entry, Number(quantity), unit);
  function changeUnit(next: AmountUnit) {
    if (next === unit || !entryUnits(entry).includes(next)) return;
    const amount = (measure: AmountUnit) => measure === 'serving' ? entry.quantity
      : measure === 'grams' ? entry.grams! : measure === 'ounces' ? entry.grams! / GRAMS_PER_OUNCE
      : entry.quantity * (entry.unit === 'fluid-ounces' ? ML_PER_FLUID_OUNCE : 1) / (measure === 'fluid-ounces' ? ML_PER_FLUID_OUNCE : 1);
    if (portion) setQuantity(String(Number((Number(quantity) * amount(next) / amount(unit)).toPrecision(12))));
    setUnit(next);
  }
  async function save() {
    if (!portion || lock.current) return;
    lock.current = true; setSaving(true); setError(null);
    try {
      const saved = await api<T>(`/api/entries?id=${encodeURIComponent(entry.id)}`, { method: 'PUT', body: { meal, quantity: Number(quantity), unit } });
      onSaved(saved);
    } catch (error) { setError(error instanceof Error ? error.message : 'Food could not be updated. Try again.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return { quantity, setQuantity, unit, changeUnit, meal, setMeal, portion, units: entryUnits(entry), saving, error, save };
}
