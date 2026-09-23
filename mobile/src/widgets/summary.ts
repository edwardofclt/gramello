import { defaultWaterGoal } from '../../../lib/water';
import { serialized, type SqliteConnection } from '../local/database';
import { validateRecord } from '../local/records';

export type WidgetAmounts = { calories: number; protein: number; carbs: number; fat: number };
export type WidgetSummary = {
  version: 1; status: 'ready'; date: string; timeZone: string; generatedAt: string;
  consumed: WidgetAmounts; goals: WidgetAmounts;
  hasFood: boolean; hasWater: boolean; hasSavedGoals: boolean; hasSavedWaterGoal: boolean;
  waterMl: number; waterGoalMl: number; waterUnit: 'ml' | 'fl-oz';
};

export function readWidgetSummary(db: SqliteConnection, defaults: WidgetAmounts, now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): Promise<WidgetSummary> {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  return serialized(db, async () => {
    await db.execAsync('BEGIN DEFERRED TRANSACTION');
    try {
      const rows = await db.getAllAsync<{kind:string;id:string;date:string|null;value:string}>(
        "SELECT kind,id,date,value FROM records WHERE (kind IN ('goals','waterGoal') AND id='default') OR (kind IN ('entry','water') AND date=?)",date);
      const result: WidgetSummary = { version:1,status:'ready',date,timeZone,generatedAt:now.toISOString(),
        consumed:{calories:0,protein:0,carbs:0,fat:0},goals:{...defaults},hasFood:false,hasWater:false,
        hasSavedGoals:false,hasSavedWaterGoal:false,waterMl:0,waterGoalMl:defaultWaterGoal.goalMl,waterUnit:defaultWaterGoal.unit };
      for (const row of rows) {
        const record = validateRecord({...row,value:JSON.parse(row.value)});
        if (record.kind === 'goals') { result.goals = record.value; result.hasSavedGoals = true; }
        if (record.kind === 'waterGoal') { result.waterGoalMl = record.value.goalMl; result.waterUnit = record.value.unit; result.hasSavedWaterGoal = true; }
        if (record.kind === 'entry') {
          for (const key of ['calories','protein','carbs','fat'] as const) result.consumed[key] += record.value[key];
          result.hasFood = true;
        }
        if (record.kind === 'water') { result.waterMl += record.value.amountMl; result.hasWater = true; }
      }
      if (![...Object.values(result.consumed),result.waterMl].every(Number.isFinite)) throw new Error('Invalid widget totals.');
      return result;
    } finally { await db.execAsync('ROLLBACK'); }
  });
}
