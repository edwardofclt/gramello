import { FoodProviderError } from '../food-search';
import { normalizeSearchText } from './normalize';

// This is a latency/cache optimization, never the hosted global quota authority.
export function createProviderCache<T>(options: { now?: () => number; ttlMs?: number; maxEntries?: number } = {}) {
  const now = options.now ?? Date.now, ttl = options.ttlMs ?? 60_000, max = options.maxEntries ?? 100;
  const entries = new Map<string, { expires: number; value: T }>();
  const pending = new Map<string, Promise<T>>();
  const backoff = new Map<string, number>();
  const keyFor = (source: string, query: string) => `${source}:${normalizeSearchText(query)}`;
  return {
    peek(source: string, query: string): T | undefined {
      const key = keyFor(source, query), cached = entries.get(key);
      if (cached && cached.expires > now()) return cached.value;
      entries.delete(key);
      return undefined;
    },
    get(source: string, query: string, work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) return Promise.reject(new Error('Operation cancelled.'));
      const key = keyFor(source, query);
      const cached = entries.get(key);
      if (cached && cached.expires > now()) return Promise.resolve(cached.value);
      entries.delete(key);
      let result = pending.get(key);
      if (!result) {
        if ((backoff.get(source) ?? 0) > now()) return Promise.reject(new FoodProviderError('Provider retry backoff', 429));
        if (pending.size >= max) return Promise.reject(new FoodProviderError('Too many pending searches', 429));
        // Shared work has its own bounded lifetime; a caller only cancels its wait.
        result = Promise.resolve().then(() => work(AbortSignal.timeout(10_000))).then(value => {
          while (entries.size >= max) entries.delete(entries.keys().next().value!);
          entries.set(key, { value, expires: now() + ttl }); return value;
        }).catch(error => {
          if (error instanceof FoodProviderError && error.status === 429) backoff.set(source, now() + 60_000);
          throw error;
        }).finally(() => { pending.delete(key); });
        pending.set(key, result);
      }
      if (!signal) return result;
      return new Promise<T>((resolve, reject) => {
        const abort = () => { cleanup(); reject(new Error('Operation cancelled.')); };
        const cleanup = () => signal.removeEventListener('abort', abort);
        signal.addEventListener('abort', abort, { once: true });
        result!.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
      });
    },
  };
}
