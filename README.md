# Nourish

A self-hostable calorie and macro tracker with a fast daily diary, precise serving and weight controls, goal tracking, and 7-day, 30-day, and 6-month analytics.

Food search combines:

- [USDA FoodData Central](https://fdc.nal.usda.gov/) for generic and branded foods
- [Open Food Facts](https://world.openfoodfacts.org/) for its open, community-maintained product database and images
- A small built-in USDA reference fallback for common staples

## Mobile app

The React Native app in [`mobile/`](mobile/README.md) uses Expo, gluestack-ui,
and the same Auth0 tenant and diary API. See its setup guide for native Auth0
registration, environment values, and iOS/Android run commands.

## Run with Docker Compose

Configure Auth0 using the steps below, then:

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Diary data is stored in the named `nourish-data` volume and survives container restarts.

## Fly.io deployment

The API and web app run at [https://nourish-api.fly.dev](https://nourish-api.fly.dev).
`fly.toml` deploys the existing Docker image in `iad` with the SQLite database
and migration markers stored on the encrypted `nourish_data` volume at `/data`.
Daily volume snapshots are retained for 14 days. This is a single-Machine
deployment: do not scale horizontally without adding database replication,
because Fly volumes do not share data between Machines. Deploys and restarts
briefly interrupt service. Keep separate database exports for long-term backups.

The four web-authentication `AUTH0_*` settings are runtime Fly secrets.
`APP_BASE_URL` is set in `fly.toml`. The optional `AUTH0_AUDIENCE` and
`AUTH0_MOBILE_CLIENT_ID` bindings default to empty strings; set Fly secrets with
the configured API audience and Native Application client ID to enable mobile
authentication on the next deployment. The Auth0 web application must allow
`https://nourish-api.fly.dev/auth/callback` as a callback URL and
`https://nourish-api.fly.dev` as a logout URL.

To deploy changes from this checkout:

```bash
fly deploy --ha=false
fly status
fly checks list
```

Migrations run on the mounted volume before the HTTP server starts. Keep exactly
one Machine attached to the existing volume; do not delete the volume when
replacing the application container. To roll back application code, redeploy a
previous image with `fly deploy --ha=false --image <previous-image>`; this does
not reverse database migrations, so check schema compatibility first.

## Local development

Requires Node.js 22+ and pnpm.

```bash
corepack enable
pnpm install
pnpm run build
for migration in drizzle/*.sql; do
  pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --file "$migration"
done
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The build creates the Wrangler
configuration used to initialize a new local database; run the migration loop
only once per database. `pnpm dev` loads `.env.local` at runtime.
To serve a production build locally instead, run
`pnpm start --env-file ../../.env.local --port 5173` (Wrangler resolves env files
relative to `dist/server/wrangler.json`).

## Auth0 setup

1. In the [Auth0 dashboard](https://manage.auth0.com/), create or select a
   **Regular Web Application**. Enable the login connections you want to offer
   through Universal Login, such as email/password or Google.
2. Add these **Allowed Callback URLs**:
   `http://localhost:5173/auth/callback, http://localhost:3000/auth/callback`.
   Add these **Allowed Logout URLs**:
   `http://localhost:5173, http://localhost:3000`.
3. Copy `.env.example` to `.env.local`. Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and
   `AUTH0_CLIENT_SECRET` from the application's settings. Generate `AUTH0_SECRET`
   with `openssl rand -hex 32`. Keep this key stable across restarts and replicas;
   replacing it signs everyone out. Never commit `.env.local`.
4. Set `APP_BASE_URL=http://localhost:5173` for development. Docker Compose reads
   `.env.local` and overrides the base URL to `http://localhost:3000`. For a
   deployment behind an HTTPS reverse proxy, set `APP_BASE_URL=https://your-host`
   in the Compose environment and register that host's `/auth/callback` and root
   URL in Auth0. Use a single canonical origin, with no path or query string.

### Native API authentication

The iOS and Android app uses a separate Auth0 **Native Application** and the
same tenant and enabled connections as the web application. In Auth0:

1. Create an API for the Nourish server. Use a stable URL-style identifier such
   as `https://api.nourish.example` (it need not resolve on the public internet),
   select RS256 signing, and enable offline access for the API.
2. Create a Native Application. Enable Refresh Token Rotation with reuse
   detection, and enable the same database, social, or enterprise connections
   used by the Regular Web Application. Register the native callback and logout
   URLs documented in `mobile/README.md` for the `nourish` scheme.
3. Set server bindings `AUTH0_AUDIENCE` to the API identifier and
   `AUTH0_MOBILE_CLIENT_ID` to the Native Application client ID. The server uses
   these values to accept only access tokens issued for this API and native app.
4. Give the mobile app the Auth0 domain, Native Application client ID, API
   audience, and Nourish API base URL. Request `openid profile email
   offline_access`. These are public identifiers. Never put
   `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, or any other client secret in the app.

Both Auth0 applications must use the same tenant connections so the same person
receives the same Auth0 `sub` on web and mobile. Nourish uses that exact verified
subject as the database owner; changing tenants, connections, or account-linking
behavior can produce a different subject and therefore a separate diary.

The five web settings and two optional native API settings are server-side
bindings. The Docker image builds without credentials;
Compose supplies them at runtime. Do not prefix these variables with
`NEXT_PUBLIC_` or include them in build arguments. For a hosted Cloudflare Worker,
set the applicable values as runtime bindings. The generated Wrangler
configuration declares all seven names without embedding their values, so
Wrangler loads them from local environment files as well as runtime bindings.
For web-only use, leave `AUTH0_AUDIENCE` and `AUTH0_MOBILE_CLIENT_ID` empty in
the environment file (or define empty runtime bindings). Bearer requests then
receive `503` while cookie sessions continue to work.

The app uses the [official Auth0 Next.js SDK](https://auth0.github.io/nextjs-auth0/)
for authorization-code login, callback validation, encrypted HTTP-only cookies,
and logout. HTTPS enables secure cookies. Sessions expire after one day of
inactivity or seven days in total. The app does not expose access tokens to the
browser. APIs return JSON `401` when the session expires and `503` if sign-in
configuration is unavailable. Cookie-authenticated writes require an `Origin`
matching `APP_BASE_URL`. Native writes authenticate with the bearer token and do
not require a browser Origin header. Responses vary by both Cookie and
Authorization so caches cannot mix identities.

Each user's data belongs to their verified Auth0 `sub`. Incoming
`oai-authenticated-user-*` headers and client-supplied user IDs cannot select a
diary. Existing `site-owner` or ChatGPT data stays in the database, but is not
automatically assigned to an Auth0 user. To migrate it, back up the database,
verify the intended owner's Auth0 subject, and deliberately reassign that user's
rows in both `goals` and `entries`; resolve any existing goal row first.

## Verification

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm test:smoke
```

Tests exercise the real Auth0 cookie/session code and database queries with two
users, including anonymous requests, spoofed headers, expired cookies, CSRF, and
deletion ownership. The smoke check runs the built Worker with temporary
credentials and an isolated local database; it does not modify your diary or
contact Auth0. Complete a real login and logout with your configured tenant
before deploying.

## Releases

Commits use the [Conventional Commits](https://www.conventionalcommits.org/) format. Merges to `main` run semantic-release, generate release notes and the changelog, create a GitHub release, and publish multi-architecture Docker images to GitHub Container Registry:

```text
ghcr.io/<owner>/<repository>:latest
ghcr.io/<owner>/<repository>:<version>
```

Use `fix:` for patch releases, `feat:` for minor releases, and a `BREAKING CHANGE:` footer for major releases.

Stable releases also build the iOS app on Expo EAS and submit it to TestFlight.
The build uses the release tag's code and version; EAS increments the build number.
The repository's `EXPO_TOKEN` Actions secret authenticates the build robot.
See [mobile TestFlight setup](mobile/README.md#testflight) for credentials and manual reruns.
