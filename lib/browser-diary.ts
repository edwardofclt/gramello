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
      return privateResponse(Response.json({ error: 'This request is not allowed.' }, { status: 403 }));
    }
    if (!cookie) {
      return privateResponse(Response.json({ error: 'Open your diary and enable cookies before saving.' }, { status: 400 }));
    }
  }
  const value = cookie ?? newDiaryCookie();
  // Separate anonymous diaries from every former account/legacy namespace.
  const response = privateResponse(await handler({ userId: `browser:${value}` }));
  if (!cookie) setDiaryCookie(request, response, value);
  return response;
}
