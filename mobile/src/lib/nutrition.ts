import type { Food, Goals } from './types';

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDate(date: string, days: number) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function formatDate(date: string, short = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    ...(short ? {} : { weekday: 'short' as const }), month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

export function scaleFood(food: Pick<Food, keyof Goals | 'servingGrams'>, quantity: number, unit: 'serving' | 'grams') {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const grams = unit === 'grams' ? quantity : quantity * food.servingGrams;
  if (!Number.isFinite(grams) || grams <= 0) return null;
  const factor = grams / 100;
  return { grams, calories: food.calories * factor, protein: food.protein * factor, carbs: food.carbs * factor, fat: food.fat * factor };
}

export function sumNutrition(items: Goals[]): Goals {
  return items.reduce((total, item) => ({
    calories: total.calories + item.calories, protein: total.protein + item.protein,
    carbs: total.carbs + item.carbs, fat: total.fat + item.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

export { changeGoal, macroPercent } from '../../../app/goal-math';
