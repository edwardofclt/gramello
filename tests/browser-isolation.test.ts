import { expect, it } from 'vitest';
import { isolateBrowserResponse } from '../lib/browser-isolation';
it('isolates compiled responses without losing cookies, status or streaming body', async () => {
  const original = new Response('diary', { status: 201, headers: { 'Set-Cookie': 'gramello_diary=fixture; HttpOnly', 'Cache-Control': 'private, no-store' } });
  const response = isolateBrowserResponse(original);
  expect(response.status).toBe(201); expect(response.headers.get('set-cookie')).toBe(original.headers.get('set-cookie'));
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
  expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp'); expect(await response.text()).toBe('diary');
});
