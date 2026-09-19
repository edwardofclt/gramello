type Goals = { calories: number; protein: number; carbs: number; fat: number };
const energy = { protein: 4, carbs: 4, fat: 9 } as const;
export function macroCalories(goals: Goals) {
  return goals.protein * 4 + goals.carbs * 4 + goals.fat * 9;
}
export function macroPercent(goals: Goals, key: keyof typeof energy) {
  const total = macroCalories(goals);
  return total > 0 ? goals[key] * energy[key] / total * 100 : 0;
}
export function changeGoal(goals: Goals, key: keyof Goals, value: number): Goals {
  if (!Number.isFinite(value) || value < 0) return goals;
  if (key !== "calories") {
    const next = { ...goals, [key]: value };
    return { ...next, calories: Math.round(macroCalories(next) * 100) / 100 };
  }
  const total = macroCalories(goals);
  // A zero-macro draft has no ratio: start with a 30/40/30 calorie split.
  const shares = total > 0
    ? { protein: goals.protein * 4 / total, carbs: goals.carbs * 4 / total, fat: goals.fat * 9 / total }
    : { protein: .3, carbs: .4, fat: .3 };
  return { calories: value, protein: value * shares.protein / 4, carbs: value * shares.carbs / 4, fat: value * shares.fat / 9 };
}
