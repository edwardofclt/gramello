import { env } from 'cloudflare:workers';

const cookieName = 'gramello_diary';

export function readDiaryCookie(request: Request): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function newDiaryCookie() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function setDiaryCookie(request: Request, response: Response, value: string) {
  const secure = new URL(env.APP_BASE_URL || request.url).protocol === 'https:' ? '; Secure' : '';
  response.headers.append('Set-Cookie', `${cookieName}=${value}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
}

function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Cookie');
  return response;
}

async function releaseRejectedBody(request: Request) {
  if (!request.body || request.body.locked) return;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiresAt = Date.now() + 100;
  const deadline = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 100); });
  let ended = false;
  try {
    // Canceling even a tiny unread body can poison the local Worker proxy's
    // next request. Discard small bodies to EOF, never parsing or storing them.
    // One deadline and byte budget also bound chunked/misdeclared uploads.
    let remaining = 16 * 1024;
    while (remaining > 0 && Date.now() < expiresAt) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (!chunk) break;
      if (chunk.done) { ended = true; break; }
      remaining -= chunk.value.byteLength;
    }
  } catch { /* The client may already have disconnected. */ }
  finally {
    clearTimeout(timer);
    // A disconnected source's cancel promise can itself stall. Initiate it
    // without letting it extend the rejection deadline; observe any rejection.
    if (!ended) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function rejectWrite(request: Request, error: string, status: 400 | 403) {
  await releaseRejectedBody(request);
  return privateResponse(Response.json({ error }, { status }));
}

// Establish the browser's diary before the page starts concurrent API reads.
export function prepareBrowserDiary(request: Request, response: Response) {
  if (!readDiaryCookie(request)) setDiaryCookie(request, response, newDiaryCookie());
  return privateResponse(response);
}

export async function withBrowserDiary(
  request: Request,
  handler: (diary: { userId: string }) => Promise<Response>,
): Promise<Response> {
  const cookie = readDiaryCookie(request);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = env.APP_BASE_URL ? new URL(env.APP_BASE_URL).origin : new URL(request.url).origin;
    if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') {
      return rejectWrite(request, 'This request is not allowed.', 403);
    }
    if (!cookie) {
      return rejectWrite(request, 'Open your diary and enable cookies before saving.', 400);
    }
  }
  const value = cookie ?? newDiaryCookie();
  // Separate anonymous diaries from every former account/legacy namespace.
  const response = privateResponse(await handler({ userId: `browser:${value}` }));
  if (!cookie) setDiaryCookie(request, response, value);
  return response;
}
