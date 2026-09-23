import { withBrowserDiary } from '@/lib/browser-diary';
import { parseCustomFood } from '@/lib/food';
import { createCustomFood } from '@/db/foods';

export async function POST(request: Request) {
  return withBrowserDiary(request, async ({ userId }) => {
    let input;
    try { input = parseCustomFood(await request.json()); }
    catch { return Response.json({ error: 'Enter a food name, serving description, and a nonnegative number for calories, protein, carbs, and fat. Optional serving weight must be greater than zero.' }, { status: 400 }); }
    try { return Response.json({ food: await createCustomFood(userId, input) }, { status: 201 }); }
    catch (error) { console.error('Custom food save failed', error); return Response.json({ error: 'Your food could not be saved. Please try again.' }, { status: 503 }); }
  });
}
