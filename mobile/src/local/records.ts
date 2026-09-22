import { z } from 'zod';
import { summarizeMeal } from '../../../lib/meals';
import { waterDateSchema, waterGoalSchema, waterEntrySchema } from '../../../lib/water';

export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const id = z.string().min(1).max(200);
const finite = z.number().finite().nonnegative().max(1e12);
export const nutritionSchema = z.object({ calories: finite, protein: finite, carbs: finite, fat: finite });
export const goalsSchema = nutritionSchema.extend({ calories: z.number().finite().positive().max(100000) });
const timestamp = z.string().datetime({ offset: true });
export const foodSchema = nutritionSchema.extend({
  id, name: z.string().min(1).max(300), source: z.string().min(1).max(200), brand: z.string().max(300).optional(),
  sourceUrl: z.string().url().max(2000).optional(), sourceKind: z.enum(['database', 'restaurant', 'custom']).optional(), verified: z.boolean().optional(),
  servingGrams: z.number().finite().nonnegative().max(1e6).nullable(), servingLabel: z.string().max(200),
  nutritionBasis: z.enum(['100g', '100ml', 'serving']).optional(), nutritionUnit: z.enum(['g', 'ml']).optional(), servingMl: z.number().finite().positive().max(1e6).optional(),
  image: z.string().url().max(2000).optional(), checkedAt: z.string().max(40).optional(),
});
const quantity = z.number().finite().positive().max(1e6);
export const units = z.enum(['serving', 'grams', 'ounces', 'milliliters', 'fluid-ounces']);
export const entrySchema = nutritionSchema.extend({
  id, date: waterDateSchema, createdAt: timestamp, meal: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snacks']), name: z.string().min(1).max(300),
  brand: z.string().max(300).optional(), source: z.string().max(200), sourceId: id.optional(), quantity, unit: units, grams: finite.nullable(),
  verified: z.boolean().optional(), sourceUrl: z.string().url().max(2000).optional(), servingLabel: z.string().max(200).optional(),
});
export const mealSchema = z.object({ id, updatedAt: timestamp, name: z.string().trim().min(1).max(150),
  ingredients: z.array(z.object({ food: foodSchema, quantity, unit: units })).min(1).max(100),
  totalGrams: quantity.nullable(), servingGrams: quantity,
}).superRefine((meal, context) => {
  try { summarizeMeal(meal); } catch { context.addIssue({ code: 'custom', message: 'Invalid recipe amounts.' }); }
});
const base = { id, date: waterDateSchema.nullable() };
const recordSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('entry'), value: entrySchema }),
  z.object({ ...base, kind: z.literal('food'), value: foodSchema }),
  z.object({ ...base, kind: z.literal('meal'), value: mealSchema }),
  z.object({ ...base, kind: z.literal('goals'), value: goalsSchema }),
  z.object({ ...base, kind: z.literal('water'), value: waterEntrySchema.extend({ id, createdAt: timestamp }) }),
  z.object({ ...base, kind: z.literal('waterGoal'), value: waterGoalSchema }),
]).superRefine((record, context) => {
  const value = record.value;
  if (('id' in value && value.id !== record.id) || ('date' in value ? value.date !== record.date : record.date !== null)
    || (['goals', 'waterGoal'].includes(record.kind) && record.id !== 'default')) {
    context.addIssue({ code: 'custom', message: 'Backup record identity is inconsistent.' });
  }
});
export type PersonalRecord = z.infer<typeof recordSchema>;
const archiveSchema = z.object({ format: z.literal('gramello'), version: z.literal(1), exportedAt: timestamp, records: z.array(recordSchema).max(200000) })
  .superRefine((archive, context) => {
    const seen = new Set<string>();
    for (const record of archive.records) {
      const key = `${record.kind}:${record.id}`;
      if (seen.has(key)) context.addIssue({ code: 'custom', message: 'Duplicate backup record.' });
      seen.add(key);
    }
  });
export type Archive = z.infer<typeof archiveSchema>;
export function parseArchive(text: string): Archive {
  if (text.length > MAX_ARCHIVE_BYTES || new TextEncoder().encode(text).byteLength > MAX_ARCHIVE_BYTES) throw new Error('Backup exceeds the 32 MB import limit.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('This is not a readable Gramello backup.'); }
  const result = archiveSchema.safeParse(value);
  if (!result.success) throw new Error('This backup is incomplete, invalid, or from a newer version of Gramello.');
  return result.data;
}
export function validateRecord(value: unknown): PersonalRecord { return recordSchema.parse(value); }
export function archiveCsv(archive: Archive) {
  const cell = (value: unknown) => {
    let text = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = (rows: unknown[][]) => rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  return {
    diary: csv([['date', 'meal', 'food', 'brand', 'quantity', 'unit', 'grams', 'calories', 'protein', 'carbs', 'fat', 'source'],
      ...archive.records.flatMap(r => r.kind === 'entry' ? [[r.value.date, r.value.meal, r.value.name, r.value.brand, r.value.quantity, r.value.unit, r.value.grams, r.value.calories, r.value.protein, r.value.carbs, r.value.fat, r.value.source]] : [])]),
    water: csv([['date', 'amount_ml', 'created_at'], ...archive.records.flatMap(r => r.kind === 'water' ? [[r.value.date, r.value.amountMl, r.value.createdAt]] : [])]),
  };
}
