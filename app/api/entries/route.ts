import { withAuthenticatedUser } from '@/lib/auth';
import { addEntry, removeEntry, type EntryInput } from '@/db/store';
import { getFood } from '@/db/foods';
import { scaleFood } from '@/lib/food';

export async function POST(request: Request) {
  return withAuthenticatedUser(request, async ({ userId }) => {
    let b: EntryInput;
    try { b = await request.json(); }
    catch { return Response.json({ error: 'That food entry is incomplete.' }, { status: 400 }); }
    if (!b || typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !['Breakfast', 'Lunch', 'Dinner', 'Snacks'].includes(b.meal)
      || typeof b.quantity !== 'number' || !Number.isFinite(b.quantity) || b.quantity <= 0 || b.quantity > 100_000 || !['serving', 'grams'].includes(b.unit)
      || (b.sourceId !== undefined && typeof b.sourceId !== 'string')) {
      return Response.json({ error: 'That food entry is incomplete.' }, { status: 400 });
    }
    try {
      const food = b.sourceId ? await getFood(b.sourceId) : null;
      let item: EntryInput;
      if (food) {
        const portion = scaleFood(food, b.quantity, b.unit as 'serving' | 'grams');
        if (!portion) return Response.json({ error: 'Choose a valid serving amount. Weight is unavailable for this food.' }, { status: 400 });
        item = { date: b.date, meal: b.meal, sourceId: food.id, name: food.name, brand: food.brand, source: food.source,
          verified: food.verified, sourceUrl: food.sourceUrl, servingLabel: food.servingLabel,
          quantity: b.quantity, unit: b.unit, ...portion };
      } else {
        // Older clients can still log a snapshot, but a source name/id or boolean
        // supplied by a client is never evidence that its numbers were verified.
        const values = [b.calories, b.protein, b.carbs, b.fat];
        if (!b.name || typeof b.name !== 'string' || b.name.length > 200 || values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)
          || (b.grams !== null && (typeof b.grams !== 'number' || !Number.isFinite(b.grams) || b.grams < 0))) {
          return Response.json({ error: 'That food entry is incomplete. Search for the food again.' }, { status: 400 });
        }
        item = { date: b.date, meal: b.meal, name: b.name, brand: typeof b.brand === 'string' ? b.brand : undefined, source: 'Unverified entry',
          sourceId: b.sourceId, quantity: b.quantity, unit: b.unit, grams: b.grams, calories: b.calories, protein: b.protein, carbs: b.carbs, fat: b.fat, verified: false };
      }
      return Response.json(await addEntry(userId, item), { status: 201 });
    } catch (error) { console.error(error); return Response.json({ error: 'Food could not be added.' }, { status: 503 }); }
  });
}
export async function DELETE(request: Request) {
  return withAuthenticatedUser(request, async ({ userId }) => {
    try {
      const id = new URL(request.url).searchParams.get('id');
      if (!id) return Response.json({ error: 'Missing food entry.' }, { status: 400 });
      await removeEntry(userId, id); return Response.json({ ok: true });
    } catch (error) { console.error(error); return Response.json({ error: 'Food could not be removed.' }, { status: 503 }); }
  });
}
