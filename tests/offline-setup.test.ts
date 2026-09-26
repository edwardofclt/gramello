import { afterEach, expect, it, vi } from 'vitest';
import { prepareOffline } from '../lib/offline-setup';

function registration(state = 'installing') {
  const worker = Object.assign(new EventTarget(), { state });
  const registration = Object.assign(new EventTarget(), { installing: worker, waiting: null, active: null });
  const container = { register: vi.fn().mockResolvedValue(registration) } as unknown as Pick<ServiceWorkerContainer, 'register'>;
  return { worker, registration, container };
}
afterEach(() => vi.useRealTimers());
it('reports a failed cache installation even though registration succeeded', async () => {
  const fixture = registration();
  const pending = prepareOffline(fixture.container);
  const result = expect(pending).rejects.toThrow('Offline setup failed');
  await Promise.resolve();
  fixture.worker.state = 'redundant'; fixture.worker.dispatchEvent(new Event('statechange'));
  await result;
});
it('only declares offline access ready after activation', async () => {
  const fixture = registration();
  const done = vi.fn();
  const pending = prepareOffline(fixture.container).then(done);
  await Promise.resolve();
  fixture.worker.state = 'installed'; fixture.worker.dispatchEvent(new Event('statechange'));
  await Promise.resolve(); expect(done).not.toHaveBeenCalled();
  fixture.worker.state = 'activated'; fixture.worker.dispatchEvent(new Event('statechange'));
  await pending; expect(done).toHaveBeenCalledOnce();
});
it('reports a stalled installation with a retryable error', async () => {
  vi.useFakeTimers();
  const pending = prepareOffline(registration().container);
  const result = expect(pending).rejects.toThrow('did not finish');
  await vi.advanceTimersByTimeAsync(60000);
  await result;
});
