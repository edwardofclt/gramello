import { env } from 'cloudflare:workers';
import { parseArchive, type Archive } from '../mobile/src/local/records';

type Row = Record<string, unknown>;

export class HostedBackupError extends Error {}

// SQL represents absent optional fields as null; native backups omit them.
// Keep required nullable measurements (grams/servingGrams/totalGrams) intact.
function optionalFields(row: Row, fields: readonly string[]): Row {
  const value = { ...row };
  for (const field of fields) if (value[field] === null) delete value[field];
  return value;
}

function verified(value: unknown): unknown {
  // Unexpected stored values must fail validation rather than become false.
  return value === 1 ? true : value === 0 ? false : value;
}

function foodValue(row: Row): Row {
  return {
    ...optionalFields(row, ['brand', 'sourceUrl', 'image', 'checkedAt', 'servingMl']),
    verified: verified(row.verified),
    ...(row.nutritionBasis === '100ml' ? { nutritionUnit: 'ml' } : {}),
  };
}

function mealValue(row: Row): Row {
  let ingredients: unknown;
  try { ingredients = JSON.parse(row.ingredients as string); }
  catch { throw new HostedBackupError('A saved meal in your hosted diary could not be read. No hosted data was changed.'); }
  return { ...row, ingredients };
}

export async function exportHostedArchive(userId: string): Promise<Archive> {
  if (!env.DB) throw new Error('Hosted diary storage unavailable.');
  const rows = async (sql: string): Promise<Row[]> => {
    const result = await env.DB!.prepare(sql).bind(userId).all<Row>();
    if (!Array.isArray(result.results)) throw new Error('Hosted diary export query failed.');
    return result.results;
  };
  // No date range, defaults, shared catalog rows, or mutations belong in a
  // personal export. A truly empty hosted diary remains distinguishable.
  const [entries, foods, meals, goals, water, waterGoals] = await Promise.all([
    rows(`SELECT id, entry_date as date, meal, food_name as name, brand, source, source_id as sourceId,
      quantity, unit, grams, verified, source_url as sourceUrl, serving_label as servingLabel,
      calories, protein, carbs, fat, created_at as createdAt FROM entries WHERE user_id = ? ORDER BY id`),
    rows(`SELECT id, name, brand, source, source_kind as sourceKind, source_url as sourceUrl, verified,
      nutrition_basis as nutritionBasis, serving_grams as servingGrams, serving_ml as servingMl,
      serving_label as servingLabel, calories, protein, carbs, fat, image, checked_at as checkedAt
      FROM foods WHERE created_by = ? AND source_kind = 'custom' ORDER BY id`),
    rows(`SELECT id, name, ingredients, total_grams as totalGrams, serving_grams as servingGrams,
      updated_at as updatedAt FROM custom_meals WHERE user_id = ? ORDER BY id`),
    rows('SELECT calories, protein, carbs, fat FROM goals WHERE user_id = ?'),
    rows(`SELECT id, entry_date as date, amount_ml as amountMl, created_at as createdAt
      FROM water_entries WHERE user_id = ? ORDER BY id`),
    rows('SELECT goal_ml as goalMl, unit FROM water_goals WHERE user_id = ?'),
  ]);
  const records = [
    ...entries.map(row => ({ kind: 'entry', id: row.id, date: row.date, value: {
      ...optionalFields(row, ['brand', 'sourceId', 'sourceUrl', 'servingLabel']), verified: verified(row.verified),
    } })),
    ...foods.map(row => ({ kind: 'food', id: row.id, date: null, value: foodValue(row) })),
    ...meals.map(row => ({ kind: 'meal', id: row.id, date: null, value: mealValue(row) })),
    ...goals.map(value => ({ kind: 'goals', id: 'default', date: null, value })),
    ...water.map(value => ({ kind: 'water', id: value.id, date: value.date, value })),
    ...waterGoals.map(value => ({ kind: 'waterGoal', id: 'default', date: null, value })),
  ];
  // Use the actual native importer as the contract, including byte/record limits.
  // Never emit a partial archive by filtering out records that cannot migrate.
  try {
    return parseArchive(JSON.stringify({ format: 'gramello', version: 1, exportedAt: new Date().toISOString(), records }));
  } catch (error) {
    if (error instanceof Error && error.message.includes('32 MB')) {
      throw new HostedBackupError('Your hosted diary exceeds the 32 MB backup limit. No hosted data was changed.');
    }
    throw new HostedBackupError('Your hosted diary contains data that could not be imported. No hosted data was changed.');
  }
}
