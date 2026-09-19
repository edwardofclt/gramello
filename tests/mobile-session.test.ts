import { expect, it } from 'vitest';
import { CredentialSession, requiresSignIn } from '../mobile/src/auth/credentials';
import { createApiClient, SessionExpiredError } from '../mobile/src/lib/api';
import { vi, afterEach } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it('drains an in-flight credential refresh before clearing the credential store', async () => {
  let finish!: (value: string) => void;
  const events: string[] = [];
  const session = new CredentialSession(() => new Promise(resolve => { finish = resolve; events.push('refresh'); }), async () => { events.push('clear'); });
  const token = session.getToken(0);
  const rejected = expect(token).rejects.toBeInstanceOf(SessionExpiredError);
  await Promise.resolve();
  session.advance();
  const clearing = session.clear();
  finish('old-token');
  await rejected; await clearing; await session.settled();
  expect(events).toEqual(['refresh', 'clear']);
});

it('ignores an old 401 after the session changes', async () => {
  let finish!: (value: Response) => void;
  let current = true;
  const expired = vi.fn();
  vi.stubGlobal('fetch', () => new Promise(resolve => { finish = resolve; }));
  const api = createApiClient('https://nourish.example', async () => 'old-token', expired, () => current);
  const response = api('/api/day');
  const rejected = expect(response).rejects.toBeInstanceOf(SessionExpiredError);
  await Promise.resolve();
  current = false;
  finish(Response.json({ error: 'expired' }, { status: 401 }));
  await rejected;
  expect(expired).not.toHaveBeenCalled();
});

it.each(['NO_CREDENTIALS', 'NO_REFRESH_TOKEN', 'INVALID_CREDENTIALS', 'SESSION_EXPIRED', 'RENEW_FAILED'])('prompts sign-in for normalized Auth0 credential error %s', type => {
  expect(requiresSignIn({ type, code: 'platformSpecificCode' })).toBe(true);
});

it.each(['NO_NETWORK', 'API_ERROR', 'BIOMETRICS_FAILED'])('keeps a recoverable session on %s', type => {
  expect(requiresSignIn({ type })).toBe(false);
});
