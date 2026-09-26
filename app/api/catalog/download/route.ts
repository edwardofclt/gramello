import { catalogEnvelope } from '@/lib/catalog-relay';

export async function GET(request: Request) {
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120000)]);
    const { manifest } = await catalogEnvelope(signal);
    const query = new URL(request.url).searchParams;
    if (query.get('version') !== manifest.version || query.get('sha256') !== manifest.sha256) {
      return Response.json({ error: 'The catalog changed. Check for updates again.' }, { status: 409 });
    }
    // Only a publisher-signed URL is fetched. Clients cannot supply a URL.
    const response = await fetch(manifest.url, { signal });
    if (!response.ok || !response.body) throw new Error('The catalog download could not complete.');
    return new Response(response.body, { headers: {
      'Content-Type': 'application/vnd.sqlite3', 'Cache-Control': 'public, max-age=86400, immutable',
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Catalog download is unavailable.' }, { status: 503 });
  }
}
