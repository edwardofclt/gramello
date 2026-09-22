export class SessionExpiredError extends Error {
  constructor() { super('Your session has expired. Please sign in again.'); }
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal };
export type ApiClient = <T>(path: string, options?: Options) => Promise<T>;

async function withRequestDeadline<T>(options: Options, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const controller = new AbortController();
  let cancel!: () => void;
  let timer!: ReturnType<typeof setTimeout>;
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new DOMException('Aborted', 'AbortError'));
      controller.abort();
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      const recovery = !options.method || options.method === 'GET'
        ? 'Please try again.'
        : 'Check whether your changes were saved before trying again.';
      reject(new Error(`Gramello took too long to respond. ${recovery}`));
      controller.abort();
    }, 20_000);
  });
  try {
    // Bound credentials, fetch, and body parsing even when a native operation
    // ignores cancellation. Never automatically replay a possibly saved write.
    return await Promise.race([operation(controller.signal), interrupted]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

export function createApiClient(baseUrl: string, getToken: () => Promise<string>, onExpired: () => void, isCurrent = () => true): ApiClient {
  return async <T>(path: string, options: Options = {}): Promise<T> => {
    // Only fixed API-relative routes may receive a credential.
    if (!path.startsWith('/api/') || path.includes('\\')) throw new Error('Invalid API path.');
    return withRequestDeadline(options, async signal => {
      const token = await getToken();
      if (!isCurrent()) throw new SessionExpiredError();
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? 'GET', signal, credentials: 'omit',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      // A response from an earlier account must never expire a new login.
      if (!isCurrent()) throw new SessionExpiredError();
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (response.status === 401) {
        onExpired();
        throw new SessionExpiredError();
      }
      const data: unknown = await response.json().catch(() => null);
      if (!isCurrent()) throw new SessionExpiredError();
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : null;
      if (!response.ok) throw new Error(message || 'Gramello could not be reached. Please try again.');
      if (data === null) throw new Error('Gramello returned an unreadable response. Please try again.');
      return data as T;
    });
  };
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
