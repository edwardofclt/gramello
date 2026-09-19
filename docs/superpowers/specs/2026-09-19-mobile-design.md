# Nourish mobile

Build a native iOS and Android companion in `mobile/` using Expo, React Native,
TypeScript, and gluestack-ui core components styled with React Native styles.
Keep the existing web application and database. The mobile app uses the existing
day, food-search, entry, goal, and trend endpoints.

## Authentication

Use the official Auth0 React Native SDK, Universal Login with authorization code
and PKCE, and its secure credentials manager with refresh tokens. Register a
Native application in the existing tenant with the same connections. Public
mobile configuration contains only API URL, domain, native client ID, and API
audience. Never ship the web client secret or session encryption secret.

The server continues to authenticate web cookies and require trusted origins for
cookie-authenticated writes. Requests with Authorization must contain a valid
RS256 access token: verify signature using the tenant's JWKS, issuer, expiry,
audience, nonempty subject, and an allowlisted native client ID. Invalid bearer
credentials must not fall back to cookies. Valid tokens select data using the
same verified Auth0 subject as web sessions. Native token writes need no Origin.

## Screens and behavior

- Sign-in with account restoration, cancellation/error feedback, and logout.
- Diary with local calendar dates, previous/next day, calorie ring, macro progress,
  four meal sections, pull-to-refresh, and entry removal with confirmation.
- Add-food sheet with debounced search, serving/gram quantities, meal choice,
  scaled nutrition preview, and persisted additions.
- Trends with 7-day, 30-day, and 6-month ranges, calorie chart, logged-day averages,
  macro summaries, and honest empty/error/loading states.
- Goals with the web app's calorie/macro coupling and persisted settings.

Dark navy surfaces, mint accents, blue carbs, amber fat, generous touch targets,
safe areas, accessible labels, keyboard handling, and a persistent bottom bar.
No fabricated diary data or offline success. Prevent stale loads and duplicate
writes; discard protected UI state on sign-out/session expiry.

## Verification

Exercise signed JWT acceptance/rejection and cross-user isolation alongside the
existing cookie/CSRF tests. Test mobile request handling, local calendar math,
and nutrition scaling. Run web/mobile type checks, lint, existing tests, web
build, Expo configuration validation, and iOS/Android JS bundle exports. Document
native tenant setup and any device verification unavailable in this environment.
