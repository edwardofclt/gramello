import { z } from 'zod';

export type WaterUnit = 'ml' | 'fl-oz';
export type WaterGoal = { goalMl: number; unit: WaterUnit };
export type WaterEntry = { id: string; date: string; amountMl: number; createdAt: string };
export type WaterDay = { date: string; goal: WaterGoal; entries: WaterEntry[]; totalMl: number };
export const defaultWaterGoal: WaterGoal = { goalMl: 2000, unit: 'ml' };
export const ML_PER_FL_OZ = 29.5735295625;
export const waterUnitLabel = (unit: WaterUnit) => unit === 'ml' ? 'mL' : 'US fl oz';
export const waterToMl = (amount: number, unit: WaterUnit) => unit === 'ml' ? amount : amount * ML_PER_FL_OZ;
export const waterFromMl = (amount: number, unit: WaterUnit) => unit === 'ml' ? amount : amount / ML_PER_FL_OZ;
export const waterNumber = (amountMl: number, unit: WaterUnit) => {
  const value = waterFromMl(amountMl, unit);
  const precision = value > 0 && value < .1 ? 1000 : 10;
  return String(Math.round(value * precision) / precision);
};
export const waterLabel = (amountMl: number, unit: WaterUnit) => `${waterNumber(amountMl, unit)} ${waterUnitLabel(unit)}`;
export const waterPresets = (unit: WaterUnit) => unit === 'ml' ? [250, 500, 750] : [8, 16, 24];

// Product input bounds, not a recommended intake range. Store volume without
// rounding so changing display units never changes the amount that was logged.
export const waterAmountSchema = z.number().finite().min(1).max(10000);
export const waterDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const waterEntrySchema = z.object({ date: waterDateSchema, amountMl: waterAmountSchema });
export const waterGoalSchema = z.object({ goalMl: waterAmountSchema, unit: z.enum(['ml', 'fl-oz']) });
