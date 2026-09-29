import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: { APP_BASE_URL: 'https://gramello.test' } }));
import { withBrowserDiary } from '@/lib/browser-diary';

describe('rejected browser diary request bodies', () => {
  it.each([
    { origin: 'https://gramello.test', cookie: '', status: 400 },
    { origin: 'https://evil.test', cookie: `gramello_diary=${'a'.repeat(64)}`, status: 403 },
  ])('releases an unread POST body after rejecting with $status', async ({ origin, cookie, status }) => {
    let canceled = false;
    let pulls = 0;
    let handled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new TextEncoder().encode('{}'));
      },
      cancel() { canceled = true; },
    }, { highWaterMark: 0 });
    const request = new Request('https://gramello.test/api/entries', {
      method: 'POST', headers: { origin, cookie }, body, duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const response = await withBrowserDiary(request, async () => {
      handled = true;
      return Response.json({}, { status: 201 });
    });

    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(handled).toBe(false);
    expect(canceled).toBe(true);
    expect(pulls).toBe(0);
  });

  it('preserves the rejection if the client body is already disconnected', async () => {
    const body = new ReadableStream({
      cancel() { throw new Error('Client disconnected'); },
    }, { highWaterMark: 0 });
    const request = new Request('https://gramello.test/api/entries', {
      method: 'POST', headers: { origin: 'https://gramello.test' }, body, duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const response = await withBrowserDiary(request, async () => Response.json({}, { status: 201 }));

    expect(response.status).toBe(400);
    expect(request.bodyUsed).toBe(true);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('leaves an authorized POST body available to its handler', async () => {
    const request = new Request('https://gramello.test/api/entries', {
      method: 'POST',
      headers: { origin: 'https://gramello.test', cookie: `gramello_diary=${'a'.repeat(64)}` },
      body: JSON.stringify({ name: 'Oats' }),
    });

    const response = await withBrowserDiary(request, async () => Response.json(await request.json(), { status: 201 }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ name: 'Oats' });
  });
});
