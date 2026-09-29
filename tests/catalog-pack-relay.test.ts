import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
const config = vi.hoisted(() => ({ packManifestUrl: 'https://publisher.test/packs.json', publicKey: '' }));
vi.mock('../mobile/catalog-config.json', () => ({ default: config }));
import { GET as download } from '../app/api/catalog/packs/download/route';
import { GET as manifest } from '../app/api/catalog/packs/manifest/route';
const key = generateKeyPairSync('ed25519');
config.publicKey = key.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const pack = { schemaVersion: 1, id: 'off-1-0', source: 'off', market: 'US', license: 'ODbL-1.0', bucket: 0, buckets: 1, version: 'v1', url: 'https://publisher.test/off.sqlite', bytes: 4096, sha256: 'a'.repeat(64), count: 1 };
const payload = JSON.stringify({ schemaVersion: 2, version: 'us-v1', publishedAt: '2026-09-29T00:00:00Z', packs: [pack] });
const envelope = { payload, signature: sign(null, Buffer.from(payload), key.privateKey).toString('hex') };
afterEach(() => vi.unstubAllGlobals());
describe('signed pack relay', () => {
  it('returns the verified publisher envelope', async () => {
    vi.stubGlobal('fetch', async () => Response.json(envelope));
    const response = await manifest(new Request('https://app.test/api/catalog/packs/manifest'));
    expect(response.status).toBe(200); expect(await response.json()).toEqual(envelope);
  });
  it('downloads only an advertised pack and ignores a client-provided URL', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => { requested.push(url); return url === config.packManifestUrl ? Response.json(envelope) : new Response('sqlite'); });
    const response = await download(new Request(`https://app.test/api/catalog/packs/download?id=off-1-0&sha256=${pack.sha256}&url=https://attacker.test`));
    expect(response.status).toBe(200); expect(await response.text()).toBe('sqlite');
    expect(requested).toEqual([config.packManifestUrl, pack.url]);
  });
  it.each(['unknown', 'wrong-hash'])('rejects %s without fetching an asset', async kind => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => { requested.push(url); return Response.json(envelope); });
    const response = await download(new Request(`https://app.test/api/catalog/packs/download?id=${kind === 'unknown' ? 'other' : 'off-1-0'}&sha256=${kind === 'wrong-hash' ? '0'.repeat(64) : pack.sha256}`));
    expect(response.status).toBe(409); expect(requested).toEqual([config.packManifestUrl]);
  });
  it('rejects a tampered manifest before an asset fetch', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ ...envelope, payload: payload.replace('us-v1', 'bad') }));
    expect((await download(new Request(`https://app.test/api/catalog/packs/download?id=off-1-0&sha256=${pack.sha256}`))).status).toBe(503);
  });
});
