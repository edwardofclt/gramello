import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';

// Cache only a build's public shell/assets. Diary APIs are never intercepted.
export function offlineWeb(): Plugin {
  return {
    name: 'gramello-offline-web',
    apply: 'build',
    async generateBundle(_options, bundle) {
      if (this.environment.name !== 'client') return;
      const fixed = ['/offline/diary-worker.js', '/offline/sqlite3.wasm', '/offline/sqlite3-opfs-async-proxy.js', '/offline/sqlite3-opfs-async-proxy.js?vfs=opfs', '/offline/sqlite3-opfs-async-proxy.js?vfs=opfs-wl', '/offline/catalog.sqlite.gz', '/offline/catalog-meta.json', '/favicon-32.png', '/favicon-64.png', '/apple-touch-icon.png', '/gramello-mark.png'];
      const assets = Object.keys(bundle).filter(path => !path.endsWith('.map')).map(path => `/${path}`);
      const hash = createHash('sha256');
      for (const item of Object.values(bundle)) hash.update(item.type === 'chunk' ? item.code : item.source);
      for (const path of fixed) hash.update(await readFile(`public${path.split('?')[0]}`));
      const version = hash.digest('hex').slice(0, 20);
      const source = serviceWorkerSource(version, [...fixed, ...assets]);
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source });
    },
  };
}

export function serviceWorkerSource(version: string, assets: string[]) {
  return `
const CACHE = 'gramello-shell-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try {
    await cache.addAll(ASSETS);
    const shell = await fetch(new Request('/', { headers: { Accept: 'text/html' }, cache: 'reload' }));
    if (!shell.ok || !shell.headers.get('content-type')?.includes('text/html')) throw new Error('App shell unavailable');
    await cache.put('/', shell);
  } catch (error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('gramello-shell-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    // Keep shell and fixed worker/WASM URLs from one build together. A newly
    // installed worker activates when the old build's tabs have closed.
    event.respondWith((async () => (await (await caches.open(CACHE)).match('/')) || fetch(event.request))());
  } else if (ASSETS.includes(url.pathname)) {
    const key = url.pathname === '/offline/sqlite3-opfs-async-proxy.js' ? url.pathname + url.search : url.pathname;
    event.respondWith((async () => (await (await caches.open(CACHE)).match(key)) || fetch(event.request))());
  }
});
`;
}
