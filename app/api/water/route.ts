import { withAuthenticatedUser } from '@/lib/auth';
import { addWater, getWaterDay, removeWater } from '@/db/water';
import { waterDateSchema, waterEntrySchema } from '@/lib/water';

export async function GET(request: Request) {
  return withAuthenticatedUser(request, async ({ userId }) => {
    // The client supplies its local diary date; UTC is not the user's day.
    const date = waterDateSchema.safeParse(new URL(request.url).searchParams.get('date'));
    if (!date.success) return Response.json({ error: 'Choose a valid diary date.' }, { status: 400 });
    try { return Response.json(await getWaterDay(userId, date.data)); }
    catch (error) { console.error(error); return Response.json({ error: 'Water intake could not be loaded.' }, { status: 503 }); }
  });
}

export async function POST(request: Request) {
  return withAuthenticatedUser(request, async ({ userId }) => {
    const input = waterEntrySchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: 'Choose a valid date and water amount between 1 and 10,000 mL.' }, { status: 400 });
    try { return Response.json(await addWater(userId, input.data), { status: 201 }); }
    catch (error) { console.error(error); return Response.json({ error: 'Water intake could not be saved.' }, { status: 503 }); }
  });
}

export async function DELETE(request: Request) {
  return withAuthenticatedUser(request, async ({ userId }) => {
    const id = new URL(request.url).searchParams.get('id');
    if (!id?.trim() || id.length > 100) return Response.json({ error: 'Choose a water entry to remove.' }, { status: 400 });
    try { await removeWater(userId, id); return Response.json({ ok: true }); }
    catch (error) { console.error(error); return Response.json({ error: 'Water intake could not be removed.' }, { status: 503 }); }
  });
}
