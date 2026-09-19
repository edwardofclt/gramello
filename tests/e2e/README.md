# Browser tests

Run against a disposable local Nourish container (default http://127.0.0.1:3000):

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm exec playwright test
```

Desktop and mobile Chromium projects cover serving/weight calculations, generic
and branded search results, diary writes/deletion, goals, reload persistence,
7/30/183-day charts, and both mobile dialog scrolling regressions.
Food search responses use deterministic fixtures; database APIs are real.
This suite does not certify live USDA/Open Food Facts availability.

Each test uses a unique test user header to isolate its records from your diary.
Use a disposable volume to avoid accumulating test users. Never point this at a
public or production instance. `PLAYWRIGHT_BASE_URL` overrides the target URL.

To also verify an actual restart (Docker CLI access required):

```bash
E2E_CONTAINER_NAME=nourish-validation pnpm exec playwright test
```

The restart test is otherwise explicitly skipped. Tests run sequentially because
restarting a shared target interrupts concurrent browser sessions.
Inspect failures with `pnpm exec playwright show-report`; screenshots and traces
are retained under `test-results/`.
