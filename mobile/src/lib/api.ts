type Options = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal };
export type ApiClient = <T>(path: string, options?: Options) => Promise<T>;

export function createApiClient(baseUrl = ''): ApiClient {
  return async <T>(path: string, options: Options = {}): Promise<T> => {
    // Keep requests within the diary API, including after URL normalization.
    if (!path.startsWith('/api/') || path.includes('\\') || !new URL(path, 'https://gramello.invalid').pathname.startsWith('/api/')) throw new Error('Invalid API path.');
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET', signal: options.signal, credentials: 'include',
      headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const data: unknown = await response.json().catch(() => null);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : null;
    if (!response.ok) throw new Error(message || 'Gramello could not be reached. Please try again.');
    if (data === null) throw new Error('Gramello returned an unreadable response. Please try again.');
    return data as T;
  };
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
