import type { Goals } from './types';
export { scaleFood } from '../../../lib/meals';

export { localDate } from '../../../lib/diary-date';

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

export function sumNutrition(items: Goals[]): Goals {
  return items.reduce((total, item) => ({
    calories: total.calories + item.calories, protein: total.protein + item.protein,
    carbs: total.carbs + item.carbs, fat: total.fat + item.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

export { changeGoal, macroPercent } from '../../../app/goal-math';
