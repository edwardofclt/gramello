'use client';

import type { Food } from '@/lib/food';
import { foodServingOptions, selectedFoodServingId, selectFoodServing } from '@/lib/serving-options';

export function ServingPicker({ food, onChange, disabled }: { food: Food; onChange: (food: Food) => void; disabled?: boolean }) {
  const options = foodServingOptions(food);
  if (options.length < 2) return null;
  return <label className="meal-field">Serving size
    <select aria-label="Serving size" value={selectedFoodServingId(food)} disabled={disabled} onChange={event => {
      const next = selectFoodServing(food, event.target.value);
      if (next) onChange(next);
    }}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
  </label>;
}
