export type Goals = { calories: number; protein: number; carbs: number; fat: number };
export type MacroKey = 'protein' | 'carbs' | 'fat';
export const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const;
export type Meal = typeof meals[number];
export type Food = Goals & {
  id: string; name: string; brand?: string; source: string;
  servingGrams: number; servingLabel: string; image?: string;
};
export type Entry = Goals & {
  id: string; meal: string; name: string; brand?: string; source: string;
  sourceId?: string; quantity: number; unit: string; grams: number;
};
export type Day = { goals: Goals; entries: Entry[] };
export type Trend = Goals & { date: string };
