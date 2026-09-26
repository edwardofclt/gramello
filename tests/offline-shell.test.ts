import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { serviceWorkerSource } from '../build/offline-vite-plugin';

function setup() {
  type Event = { request?: { method: string; url: string; mode: string }; respondWith?: (response: Promise<Response>) => void; waitUntil?: (work: Promise<void>) => void };
  const listeners = new Map<string, (event: Event) => void>();
  const match = vi.fn().mockImplementation(async () => new Response('same-build shell'));
  const addAll = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(true);
  const fetch = vi.fn().mockResolvedValue(new Response('new server shell', { headers: { 'Content-Type': 'text/html' } }));
  runInNewContext(serviceWorkerSource('test-version', ['/offline/diary-worker.js', '/offline/sqlite3.wasm']), {
    URL, Request, self: { location: new URL('https://gramello.test/'), addEventListener: (type: string, handler: (event: Event) => void) => listeners.set(type, handler), clients: { claim: async () => {} } },
    caches: { open: async () => ({ match, addAll, put: vi.fn() }), delete: remove, keys: async () => [] }, fetch,
  });
  return { listeners, match, addAll, remove, fetch };
}

it('keeps navigations on the same cached build as the fixed worker and WASM assets', async () => {
  const fixture = setup();
  let pending: Promise<Response> | undefined;
  fixture.listeners.get('fetch')!({ request: { url: 'https://gramello.test/', method: 'GET', mode: 'navigate' }, respondWith: response => { pending = response; } });
  expect(await (await pending!).text()).toBe('same-build shell');
  expect(fixture.fetch).not.toHaveBeenCalled();
});

it('never intercepts hosted personal API reads, writes, or external traffic', () => {
  const fixture = setup();
  const respondWith = vi.fn();
  for (const request of [
    { url: 'https://gramello.test/api/backup', method: 'GET', mode: 'cors' },
    { url: 'https://gramello.test/api/water', method: 'POST', mode: 'cors' },
    { url: 'https://world.openfoodfacts.org/api/v2/product/123', method: 'GET', mode: 'cors' },
  ]) fixture.listeners.get('fetch')!({ request, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
  expect(fixture.match).not.toHaveBeenCalled();
});

it('discards an incomplete shell cache when an offline asset cannot be stored', async () => {
  const fixture = setup(); fixture.addAll.mockRejectedValue(new Error('Quota exceeded'));
  let pending: Promise<void> | undefined;
  fixture.listeners.get('install')!({ waitUntil: work => { pending = work; } });
  await expect(pending).rejects.toThrow('Quota exceeded');
  expect(fixture.remove).toHaveBeenCalledWith('gramello-shell-test-version');
});
