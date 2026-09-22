import { withAuthenticatedUser } from '@/lib/auth';
import { cacheDatabaseFoods } from '@/db/foods';
import { lookupBarcode } from '@/lib/barcode-food';

export async function GET(request: Request) {
  return withAuthenticatedUser(request, async () => {
    const result = await lookupBarcode(new URL(request.url).searchParams.get('code') ?? '', request.signal);
    if ('food' in result) {
      try { await cacheDatabaseFoods([result.food]); }
      catch { return Response.json({ error: 'This food could not be saved to the catalog. Try again.' }, { status: 503 }); }
    }
    return Response.json('food' in result ? { food: result.food } : { error: result.error }, { status: result.status });
  });
}
