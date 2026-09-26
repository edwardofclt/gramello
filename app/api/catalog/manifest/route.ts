import { catalogEnvelope } from '@/lib/catalog-relay';

export async function GET(request: Request) {
  try {
    const { envelope } = await catalogEnvelope(AbortSignal.any([request.signal, AbortSignal.timeout(20000)]));
    return Response.json(envelope, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Catalog updates are unavailable.' }, { status: 503 });
  }
}
