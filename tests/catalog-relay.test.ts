import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configuration = vi.hoisted(() => ({
  manifestUrl: 'https://publisher.test/releases/manifest.json',
  publicKey: '',
}));
vi.mock('../mobile/catalog-config.json', () => ({ default: configuration }));

import { catalogEnvelope } from '../lib/catalog-relay';
import { GET as getManifest } from '../app/api/catalog/manifest/route';
import { GET as download } from '../app/api/catalog/download/route';

const publisher = generateKeyPairSync('ed25519');
const outsider = generateKeyPairSync('ed25519');
const manifest = {
  schemaVersion: 1,
  version: '2026-09-26.1',
  publishedAt: '2026-09-26T00:00:00Z',
  url: 'https://publisher.test/releases/2026-09-26.1/foods.sqlite',
  bytes: 4096,
  sha256: 'a'.repeat(64),
  count: 100,
};
function signed(value: unknown = manifest, privateKey = publisher.privateKey) {
  const payload = JSON.stringify(value);
  return { payload, signature: sign(null, Buffer.from(payload), privateKey).toString('hex') };
}
function downloadRequest(overrides: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams({ version: manifest.version, sha256: manifest.sha256 });
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) query.set(key, value);
  return new Request(`https://gramello.test/api/catalog/download?${query}`);
}

beforeEach(() => {
  configuration.publicKey = publisher.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
});
afterEach(() => vi.unstubAllGlobals());

describe('catalog publisher relay', () => {
  it('cryptographically verifies the configured publisher’s envelope and fetches only the configured manifest', async () => {
    const envelope = signed();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(envelope));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    await expect(catalogEnvelope(signal)).resolves.toEqual({ envelope, manifest });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(configuration.manifestUrl, { signal, headers: { Accept: 'application/json' } });
  });

  it('returns the signed envelope with public cache headers and ignores arbitrary client manifest URLs', async () => {
    const envelope = signed();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(envelope));
    vi.stubGlobal('fetch', fetcher);
    const response = await getManifest(new Request('https://gramello.test/api/catalog/manifest?url=https://attacker.test/data&manifestUrl=http://127.0.0.1/private'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(envelope);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(configuration.manifestUrl, expect.objectContaining({ signal: expect.any(AbortSignal), headers: { Accept: 'application/json' } }));
  });

  it.each(['tampered payload', 'another signing key'])('rejects %s before relaying either a manifest or an asset', async reason => {
    const envelope = reason === 'tampered payload'
      ? { ...signed(), payload: JSON.stringify({ ...manifest, url: 'https://attacker.test/foods.sqlite' }) }
      : signed(manifest, outsider.privateKey);
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(envelope));
    vi.stubGlobal('fetch', fetcher);
    const manifestResponse = await getManifest(new Request('https://gramello.test/api/catalog/manifest'));
    expect(manifestResponse.status).toBe(503);
    expect(await manifestResponse.json()).toEqual({ error: expect.stringContaining('signature') });
    const downloadResponse = await download(downloadRequest());
    expect(downloadResponse.status).toBe(503);
    expect(await downloadResponse.json()).toEqual({ error: expect.stringContaining('signature') });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([configuration.manifestUrl, configuration.manifestUrl]);
  });

  it.each([
    { schemaVersion: 2 },
    { url: 'http://publisher.test/foods.sqlite' },
    { url: 'https://user:password@publisher.test/foods.sqlite' },
  ])('rejects signed but incompatible or unsafe publisher metadata: %j', async change => {
    const fetcher = vi.fn(async () => Response.json(signed({ ...manifest, ...change })));
    vi.stubGlobal('fetch', fetcher);
    const response = await download(downloadRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expect.stringContaining('invalid metadata') });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { version: 'older-version' },
    { sha256: 'b'.repeat(64) },
    { version: '', sha256: '' },
  ])('returns 409 without fetching an asset for stale or missing download identity: %j', async change => {
    const fetcher = vi.fn(async () => Response.json(signed()));
    vi.stubGlobal('fetch', fetcher);
    const response = await download(downloadRequest(change));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'The catalog changed. Check for updates again.' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(configuration.manifestUrl, expect.any(Object));
  });

  it('streams the signed asset with SQLite cache headers and ignores a client-provided asset URL', async () => {
    const bytes = new Uint8Array([83, 81, 76, 105, 116, 101, 0, 1, 2, 3]);
    let reads = 0;
    const source = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(bytes); controller.close(); } }, { highWaterMark: 0 });
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (url === configuration.manifestUrl) return Response.json(signed());
      if (url === manifest.url) return new Response(source);
      throw new Error(`Unexpected requested URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await download(downloadRequest({ url: 'https://attacker.test/data', manifestUrl: 'http://127.0.0.1/private' }));
    expect(response.status).toBe(200);
    expect(response.body).toBe(source);
    expect(reads).toBe(0);
    expect(response.headers.get('content-type')).toBe('application/vnd.sqlite3');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400, immutable');
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([configuration.manifestUrl, manifest.url]);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(reads).toBe(1);
  });

  it.each(['manifest', 'download'])('returns 503 if the %s route cannot fetch the manifest', async route => {
    const fetcher = vi.fn(async () => { throw new Error('Publisher unavailable'); });
    vi.stubGlobal('fetch', fetcher);
    const response = route === 'manifest'
      ? await getManifest(new Request('https://gramello.test/api/catalog/manifest'))
      : await download(downloadRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Publisher unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['unavailable', 'too large', 'invalid JSON'])('rejects an %s manifest response', async failure => {
    const fetcher = vi.fn(async () => failure === 'unavailable' ? new Response('Not found', { status: 404 })
      : new Response(failure === 'too large' ? 'a'.repeat(20001) : 'not-json'));
    vi.stubGlobal('fetch', fetcher);
    const response = await getManifest(new Request('https://gramello.test/api/catalog/manifest'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['network error', 'HTTP error', 'missing body'])('returns 503 when fetching the signed asset fails: %s', async failure => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (url === configuration.manifestUrl) return Response.json(signed());
      if (failure === 'network error') throw new Error('Download unavailable');
      return failure === 'HTTP error' ? new Response('Unavailable', { status: 503 }) : new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await download(downloadRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: failure === 'network error' ? 'Download unavailable' : 'The catalog download could not complete.' });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([configuration.manifestUrl, manifest.url]);
  });
});
