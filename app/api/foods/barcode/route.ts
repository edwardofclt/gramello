import { withAuthenticatedUser } from '@/lib/auth';
import { lookupBarcode } from '@/lib/barcode-food';

export async function GET(request: Request) {
  return withAuthenticatedUser(request, async () => {
    const result = await lookupBarcode(new URL(request.url).searchParams.get('code') ?? '', request.signal);
    return Response.json('food' in result ? { food: result.food } : { error: result.error }, { status: result.status });
  });
}
