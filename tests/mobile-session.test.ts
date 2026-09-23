import { afterEach, expect, it, vi } from 'vitest';
import { createApiClient } from '../mobile/src/lib/api';

afterEach(() => vi.unstubAllGlobals());

it('does not send a request that was already cancelled', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  controller.abort();
  await expect(createApiClient()('/api/day', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('ignores a response after its request is cancelled', async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal('fetch', () => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController();
  const response = createApiClient()('/api/day', { signal: controller.signal });
  const rejected = expect(response).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  finish(Response.json({ entries: [] }));
  await rejected;
});
