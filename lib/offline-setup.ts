// register() resolves before precaching finishes. Observe installation failure
// as well as activation; serviceWorker.ready alone can wait forever.
export async function prepareOffline(container: Pick<ServiceWorkerContainer, 'register'> = navigator.serviceWorker): Promise<void> {
  const registration = await container.register('/service-worker.js', { scope: '/', updateViaCache: 'none' });
  if (registration.active?.state === 'activated') return;
  await new Promise<void>((resolve, reject) => {
    let worker: ServiceWorker | null = null;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      registration.removeEventListener('updatefound', observe);
      worker?.removeEventListener('statechange', inspect);
      if (error) reject(error); else resolve();
    };
    const inspect = () => {
      if (worker?.state === 'activated' || registration.active?.state === 'activated') finish();
      else if (worker?.state === 'redundant') finish(new Error('Offline setup failed. Check your connection and available browser storage, then try again.'));
    };
    const observe = () => {
      worker?.removeEventListener('statechange', inspect);
      worker = registration.installing ?? registration.waiting ?? registration.active;
      worker?.addEventListener('statechange', inspect);
      inspect();
    };
    const timeout = setTimeout(() => finish(new Error('Offline setup did not finish. Check your connection and try again.')), 60000);
    registration.addEventListener('updatefound', observe);
    observe();
  });
}
