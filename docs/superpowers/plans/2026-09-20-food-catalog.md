# Restaurant catalog and custom foods implementation plan

**Goal:** Import published nutrition for chains within ten miles of ZIP 29707 and let authenticated users contribute reusable, unverified foods.

**Architecture:** Store restaurant imports, database search results, and user submissions in a shared SQLite/D1 food catalog. Use explicit nutrition bases (per 100 g or per serving) and optional serving weights. Derive verification on the server, preserve it in diary snapshots, and show it on web and mobile.

**Scope approved:** User's two-part request on 2026-09-20. Research and imports use three subagents; application implementation runs in this existing isolated worktree.

## Constraints

- Radius: 10 straight-line miles from the Census representative point for ZIP/ZCTA 29707, with evidence and honest coverage gaps recorded.
- Official restaurant and nutrition database records are verified; custom submissions are always unverified. Here verified describes the source, not a laboratory measurement of an individual meal.
- Custom foods are shared/searchable by all signed-in users. Submission requires a name, serving description, total calories, protein, carbs, and fat for that serving. Weight is optional.
- Do not fabricate missing nutrients, weights, dates, or source evidence. Do not derive missing macros from calories.
- Database/cache failure must not silently become an empty successful search.
- Keep existing diary data and authentication boundaries intact; do not let client-supplied source labels or booleans confer verification.

## Tasks

- [ ] Research and import: subagents identify local chains and extract published full menus into `data/restaurant-foods/*.json`; record evidence and blockers in `docs/restaurant-import/`. Generate deterministic validated seed SQL, and audit chain coverage.
- [ ] Shared catalog and nutrition: add `lib/food.ts`, `db/foods.ts`, catalog schema/migration, custom-food POST, database provider adapters, and source-aware entry resolution. Test fractional portions, unknown weights, invalid inputs, sharing, authentication, and verification spoofing against actual SQLite.
- [ ] Web/mobile flow: add reusable custom-food forms, serving-aware food selection, source badges, source links, and persistent diary labels. Test actual form submission and reopen/search behavior; retain entered values on errors.
- [ ] Verify: run relevant tests, full tests, web/mobile typechecks, lint, build, smoke tests, and browser checks. Review generated nutrition against official sources and report explicit source gaps rather than claiming unavailable facts were imported.

## Acceptance examples

- A 600 kcal restaurant bowl with 30 g protein, 65 g carbs, and 25 g fat logs half a serving as 300/15/32.5/12.5 with no invented gram weight.
- A custom food submitted with `verified: true` and `source: "USDA"` still stores and displays as unverified.
- Changing posted macros for a verified catalog ID cannot result in a verified diary row with those changed values; the server scales its stored canonical record.
- Searching a custom name from another account returns the shared food, but never another user's diary or submitter identity.
- A provider outage returns local restaurant/custom results with a partial-search notice.
