# Browser tests

Build once, then run against the automatically started disposable Worker at
http://127.0.0.1:5198:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm exec playwright test
```

Desktop and mobile Chromium projects cover serving/weight calculations, generic
and branded search results, diary writes/deletion, goals, reload persistence,
7/30/183-day charts, and both mobile dialog scrolling regressions.
Food search responses use deterministic fixtures; database APIs are real.
This suite does not certify live USDA/Open Food Facts availability.

Each test uses an encrypted Auth0 session for a unique test account. The server
uses test-only credentials and a temporary database, applies all migrations,
and removes the database when the run ends. Custom meal tests cover batch
nutrition, ounces, fractional portions, persistence, failed saves, editing, and
deletion without changing diary history. Never point this at production.
`PLAYWRIGHT_BASE_URL` skips the test server and requires an explicitly configured
disposable instance with matching test credentials.

To also verify an actual restart (Docker CLI access required):

```bash
E2E_CONTAINER_NAME=nourish-validation pnpm exec playwright test
```

The restart test is otherwise explicitly skipped. Tests run sequentially because
restarting a shared target interrupts concurrent browser sessions.
Inspect failures with `pnpm exec playwright show-report`; screenshots and traces
are retained under `test-results/`.
