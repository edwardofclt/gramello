import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { generateSessionCookie } from '@auth0/nextjs-auth0/testing';

export const test = base.extend({
  storageState: async ({ baseURL }, provide) => {
    const cookie = await generateSessionCookie({ user: { sub: `browser-${randomUUID()}`, name: 'Recipe Tester' }, tokenSet: { accessToken: 'unused', expiresAt: Math.floor(Date.now() / 1000) + 3600 } }, { secret: '0123456789abcdef'.repeat(4) });
    await provide({ cookies: [{ name: '__session', value: cookie, domain: new URL(baseURL!).hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax', expires: -1 }], origins: [] });
  },
});
export { expect };
