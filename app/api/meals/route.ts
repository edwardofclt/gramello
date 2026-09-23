import { withBrowserDiary } from '@/lib/browser-diary';
import { deleteMeal, listMeals, saveMeal } from '@/db/meals';
import { mealInputSchema } from '@/lib/meal-validation';
import { mealFood } from '@/lib/meals';

export async function GET(request: Request) {
  return withBrowserDiary(request, async ({ userId }) => {
    try { return Response.json({ meals: await listMeals(userId) }); }
    catch (error) { console.error(error); return Response.json({ error: 'Saved meals could not be loaded. Try again.' }, { status: 503 }); }
  });
}
async function write(request: Request, editing: boolean) {
  return withBrowserDiary(request, async ({ userId }) => {
    const id = new URL(request.url).searchParams.get('id');
    if (editing && !id) return Response.json({ error: 'Missing saved meal.' }, { status: 400 });
    const parsed = mealInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Enter a meal name, ingredients with valid amounts, and a positive batch weight and portion.' }, { status: 400 });
    try {
      const meal = await saveMeal(userId, parsed.data, editing ? id! : undefined);
      if (!meal) return Response.json({ error: 'Saved meal not found.' }, { status: 404 });
      return Response.json({ meal, food: mealFood(meal) }, { status: editing ? 200 : 201 });
    } catch (error) { console.error(error); return Response.json({ error: 'Meal could not be saved. Your draft is still here; try again.' }, { status: 503 }); }
  });
}
export const POST = (request: Request) => write(request, false);
export const PUT = (request: Request) => write(request, true);
export async function DELETE(request: Request) {
  return withBrowserDiary(request, async ({ userId }) => {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing saved meal.' }, { status: 400 });
    try {
      if (!await deleteMeal(userId, id)) return Response.json({ error: 'Saved meal not found.' }, { status: 404 });
      return Response.json({ ok: true });
    } catch (error) { console.error(error); return Response.json({ error: 'Meal could not be deleted. Try again.' }, { status: 503 }); }
  });
}
