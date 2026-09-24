import { withBrowserDiary } from '@/lib/browser-diary';
import { addEntry, removeEntry, updateEntry, type EntryInput } from '@/db/store';
import { entryEditSchema } from '@/lib/entry-edit';
import { getFood } from '@/db/foods';
import { getMeal } from '@/db/meals';
import { scaleFood, servingIdSchema, type AmountUnit } from '@/lib/food';
import { selectFoodServing } from '@/lib/serving-options';
import { mealFood } from '@/lib/meals';

export async function POST(request: Request) {
  return withBrowserDiary(request, async ({ userId }) => {
    let b: EntryInput & { servingId?: string };
    try { b = await request.json(); }
    catch { return Response.json({ error: 'That food entry is incomplete.' }, { status: 400 }); }
    if (!b || typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !['Breakfast', 'Lunch', 'Dinner', 'Snacks'].includes(b.meal)
      || typeof b.quantity !== 'number' || !Number.isFinite(b.quantity) || b.quantity <= 0 || b.quantity > 100_000 || !['serving', 'grams', 'ounces', 'milliliters', 'fluid-ounces'].includes(b.unit)
      || (b.sourceId !== undefined && typeof b.sourceId !== 'string')
      || (b.servingId !== undefined && !servingIdSchema.safeParse(b.servingId).success)) {
      return Response.json({ error: 'That food entry is incomplete.' }, { status: 400 });
    }
    try {
      const recipeId = b.sourceId?.startsWith('meal-') ? b.sourceId.slice(5) : null;
      const recipe = recipeId ? await getMeal(userId, recipeId) : null;
      if (recipeId && !recipe) return Response.json({ error: 'Saved meal not found. Choose a meal from your library.' }, { status: 404 });
      const found = recipe ? mealFood(recipe) : b.sourceId ? await getFood(b.sourceId) : null;
      const food = found ? selectFoodServing(found, b.servingId) : null;
      if (b.servingId !== undefined && !food) return Response.json({ error: 'That serving size is unavailable. Choose a serving again.' }, { status: 400 });
      let item: EntryInput;
      if (food) {
        const portion = scaleFood(food, b.quantity, b.unit as AmountUnit);
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
          sourceId: b.sourceId, quantity: b.quantity, unit: b.unit, grams: b.grams, calories: b.calories, protein: b.protein, carbs: b.carbs, fat: b.fat, verified: false,
          servingLabel: typeof b.servingLabel === 'string' && b.servingLabel.length <= 200 ? b.servingLabel : undefined };
      }
      return Response.json(await addEntry(userId, item), { status: 201 });
    } catch (error) { console.error(error); return Response.json({ error: 'Food could not be added.' }, { status: 503 }); }
  });
}
export async function PUT(request: Request) {
  return withBrowserDiary(request, async ({ userId }) => {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing food entry.' }, { status: 400 });
    const body = entryEditSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: 'Choose a valid meal and amount greater than zero.' }, { status: 400 });
    try {
      const entry = await updateEntry(userId, id, body.data);
      return entry ? Response.json(entry) : Response.json({ error: 'Food entry not found.' }, { status: 404 });
    } catch (error) {
      if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 400 });
      console.error(error); return Response.json({ error: 'Food could not be updated. Try again.' }, { status: 503 });
    }
  });
}

export async function DELETE(request: Request) {
  return withBrowserDiary(request, async ({ userId }) => {
    try {
      const id = new URL(request.url).searchParams.get('id');
      if (!id) return Response.json({ error: 'Missing food entry.' }, { status: 400 });
      await removeEntry(userId, id); return Response.json({ ok: true });
    } catch (error) { console.error(error); return Response.json({ error: 'Food could not be removed.' }, { status: 503 }); }
  });
}
