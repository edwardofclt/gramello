import { packEnvelope } from '@/lib/catalog-pack-relay';
export async function GET(request: Request) {
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120000)]);
    const { manifest } = await packEnvelope(signal), query = new URL(request.url).searchParams;
    const pack = manifest.packs.find(pack => pack.id === query.get('id') && pack.sha256 === query.get('sha256'));
    if (!pack) return Response.json({ error: 'The product packs changed. Check for updates again.' }, { status: 409 });
    // No client-controlled URL is ever fetched; only publisher-signed assets.
    const response = await fetch(pack.url, { signal });
    if (!response.ok || !response.body) throw new Error('The food pack could not be downloaded.');
    return new Response(response.body, { headers: { 'Content-Type': 'application/vnd.sqlite3', 'Cache-Control': 'public, max-age=86400, immutable' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Expansion downloads are unavailable.' }, { status: 503 }); }
}
