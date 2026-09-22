import { withAuthenticatedUser } from '@/lib/auth';
import { saveWaterGoal } from '@/db/water';
import { waterGoalSchema } from '@/lib/water';

export async function PUT(request: Request) {
  return withAuthenticatedUser(request, async ({ userId }) => {
    const goal = waterGoalSchema.safeParse(await request.json().catch(() => null));
    if (!goal.success) return Response.json({ error: 'Enter a water goal between 1 and 10,000 mL and choose a unit.' }, { status: 400 });
    try { return Response.json(await saveWaterGoal(userId, goal.data)); }
    catch (error) { console.error(error); return Response.json({ error: 'Your water goal could not be saved.' }, { status: 503 }); }
  });
}
