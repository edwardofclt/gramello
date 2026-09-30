import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: { APP_BASE_URL: 'https://gramello.test' } }));
import { withBrowserDiary } from '@/lib/browser-diary';

describe('rejected browser diary request bodies', () => {
  it.each([
    { origin: 'https://gramello.test', cookie: '', status: 400 },
    { origin: 'https://evil.test', cookie: `gramello_diary=${'a'.repeat(64)}`, status: 403 },
  ])('drains a small rejected POST to EOF before responding with $status', async ({ origin, cookie, status }) => {
    let canceled = false;
    let pulls = 0;
    let handled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new TextEncoder().encode('{}'));
        controller.close();
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
    expect(canceled).toBe(false);
    expect(pulls).toBe(1);
  });

  it('cancels a rejected upload after 16 KiB without reading another chunk', async () => {
    let pulls = 0;
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(4096)); },
      cancel() { canceled = true; },
    }, { highWaterMark: 0 });
    const request = new Request('https://gramello.test/api/entries', {
      method: 'POST', headers: { origin: 'https://gramello.test' }, body, duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const response = await withBrowserDiary(request, async () => { throw new Error('Unauthorized handler'); });
    expect(response.status).toBe(400);
    expect(pulls).toBe(4);
    expect(canceled).toBe(true);
    expect(body.locked).toBe(false);
  });

  it('bounds a stalled upload and a stalled cancellation to one 100 ms deadline', async () => {
    vi.useFakeTimers();
    try {
      let canceled = false;
      const body = new ReadableStream<Uint8Array>({
        pull() { return new Promise(() => {}); },
        cancel() { canceled = true; return new Promise(() => {}); },
      }, { highWaterMark: 0 });
      const request = new Request('https://gramello.test/api/entries', {
        method: 'POST', headers: { origin: 'https://gramello.test' }, body, duplex: 'half',
      } as RequestInit & { duplex: 'half' });
      const pending = withBrowserDiary(request, async () => { throw new Error('Unauthorized handler'); });
      await vi.advanceTimersByTimeAsync(100);
      expect((await pending).status).toBe(400);
      expect(canceled).toBe(true);
      expect(body.locked).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('preserves the rejection if the client body is already disconnected', async () => {
    const body = new ReadableStream({
      pull() { throw new Error('Client disconnected'); },
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
