# Auth0 authentication

Nourish will require an Auth0 session to access the diary and its APIs. The
official `@auth0/nextjs-auth0` SDK will own authorization-code login, callback
validation, encrypted HTTP-only session cookies, and logout. The existing
Next.js App Router interface runs through vinext on Cloudflare Workers.

## Boundaries

- `lib/auth0.ts` creates the SDK client lazily from server runtime configuration.
  No secrets are embedded in frontend assets or required to build an image.
- `proxy.ts` mounts the SDK auth routes and refreshes rolling sessions. The app
  page and each API handler independently require a verified session.
- `lib/auth.ts` exposes a minimal user profile and a shared API guard. Missing
  sessions return JSON 401; unavailable configuration returns 503. Writes also
  reject cross-origin requests. Private API responses disable caching.
- The signed-out page offers Auth0 sign-in. The authenticated app displays the
  account and sign-out action, including on mobile. Expired API sessions prompt
  sign-in again without treating private responses as food search results.

## Identity and existing data

Use the verified session's `sub` as the database user ID for every operation.
Ignore incoming identity headers and any body/query user ID. Existing
`site-owner` and old ChatGPT rows remain stored, but are not automatically
claimed by an Auth0 account. A deliberate administrative migration can assign
old data once its owner's Auth0 subject is known. No schema change is needed.

## Configuration and deployment

Require `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`,
and `APP_BASE_URL`. Document a Regular Web Application in Auth0, callback URL
`<APP_BASE_URL>/auth/callback`, and allowed logout URL `<APP_BASE_URL>`.
Docker receives values at runtime; local development loads an ignored env file;
hosted Workers use runtime secret bindings. Production uses HTTPS, except for
explicit localhost development. Remove the old ChatGPT authentication helper
and disable local simulated authentication.

## Validation

Regression tests cover anonymous and forged-header rejection for every API,
per-user reads/writes/deletion, cross-origin writes, missing configuration,
and safe callback failure behavior. Run TypeScript, lint, and production build.
Smoke-test the built Worker for auth routes, anonymous API rejection, and
session-cookie behavior. Live Auth0 login requires the tenant configuration;
record that limitation if credentials are unavailable.
