import type { ApiClient } from '../mobile/src/lib/api';
import { MAX_ARCHIVE_BYTES, parseArchive } from '../mobile/src/local/records';

export function localDiaryFetch(api: ApiClient): typeof fetch {
  return async (input, init = {}) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid' || !url.pathname.startsWith('/api/')) throw new Error('Invalid local diary request.');
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error('Unsupported diary operation.');
    const signal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const body = init.body ?? (input instanceof Request && method !== 'GET' ? await input.clone().text() : undefined);
      const value = await api(`${url.pathname}${url.search}`, {
        method: method as 'GET' | 'POST' | 'PUT' | 'DELETE', signal: signal ?? undefined,
        ...(body !== undefined && body !== null ? { body: JSON.parse(String(body)) } : {}),
      });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return Response.json(value);
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
      return Response.json({ error: error instanceof Error ? error.message : 'Your diary could not be updated.' }, { status: 400 });
    }
  };
}

export async function readHostedBackup(fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher('/api/backup', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Your previous web diary could not be retrieved. Try again when connected.');
  if (Number(response.headers.get('content-length')) > MAX_ARCHIVE_BYTES) throw new Error('Backup exceeds the 32 MB import limit.');
  const text = await response.text();
  parseArchive(text);
  return text;
}

export async function migratePreviousDiary(runtime: {
  needsHostedMigration(): Promise<boolean>;
  migrateHosted(text: string): Promise<boolean>;
}, fetcher: typeof fetch = fetch): Promise<void> {
  if (await runtime.needsHostedMigration()) await runtime.migrateHosted(await readHostedBackup(fetcher));
}

export function downloadFile(text: string, name: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
