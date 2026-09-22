# Restaurant catalog and custom foods implementation plan

**Goal:** Import published nutrition for chains within ten miles of ZIP 29707 and let hosted browser users contribute reusable, unverified foods.

**Architecture:** Store restaurant imports, database search results, and user submissions in a shared SQLite/D1 food catalog. Use explicit nutrition bases (per 100 g, per 100 mL, or per serving) and optional serving weights. Derive verification on the server, preserve it in diary snapshots, and show it on web and mobile.

**Scope approved:** User's two-part request on 2026-09-20. Research and imports use three subagents; application implementation runs in this existing isolated worktree.

**Final scope:** The user stopped research at 150 restaurant catalogs and requested a PR. The frozen import contains 42,529 foods, including 57 Viva Chicken foods. The coverage inventory records 241 chains/candidates and 91 without an imported catalog; this is not a claim of exhaustive local coverage or complete current menus.

## Constraints

- Radius: 10 straight-line miles from the Census representative point for ZIP/ZCTA 29707, with evidence and honest coverage gaps recorded.
- Official restaurant and nutrition database records are verified; custom submissions are always unverified. Here verified describes the source, not a laboratory measurement of an individual meal.
- Custom foods are shared/searchable by all hosted browser users. Submission requires a name, serving description, total calories, protein, carbs, and fat for that serving. Weight is optional.
- Do not fabricate missing nutrients, weights, dates, or source evidence. Do not derive missing macros from calories.
- Database/cache failure must not silently become an empty successful search.
- Keep existing diary data and authentication boundaries intact; do not let client-supplied source labels or booleans confer verification.

## Tasks

- [x] Research and import: reconcile the frozen 150 catalogs in `data/restaurant-foods/*.json`; record source evidence, coverage, and blockers in `docs/restaurant-import/`. Generate deterministic validated seed SQL and document remaining gaps.
- [x] Shared catalog and nutrition: add `lib/food.ts`, `db/foods.ts`, catalog schema/migration, custom-food POST, database provider adapters, and source-aware entry resolution. Test fractional portions, unknown weights, invalid inputs, sharing, authentication, and verification spoofing against actual SQLite.
- [x] Web/mobile flow: add reusable custom-food forms, serving-aware food selection, source badges, source links, and persistent diary labels. Test actual form submission and reopen/search behavior; retain entered values on errors.
- [x] Verify: run relevant tests, full tests, web/mobile typechecks, lint, build, smoke tests, and browser checks. Review generated nutrition against source records and report explicit source gaps rather than claiming unavailable facts were imported.

## Integration and validation

- Integrated main through `c8e8d7880124d3172eba7a2606f06cae180aa59a`, preserving My Meals, barcode volume portions, and Gramello branding.
- Kept the existing `0002_custom_meals` migration intact; added catalog schema as `0003_food_catalog` and seed as `0004_restaurant_catalog`.
- All 167 unit tests passed. Web and mobile TypeScript checks, production build, and lint passed (zero lint errors; three warnings).
- Web browser suite: 21 passed, 3 expected skips, zero failures. Skips cover one mobile-only test on desktop and optional Docker restart checks on both viewports when no container was configured.
- Mobile browser suite: all 20 cases passed across the initial run and the corrected layout-fixture rerun.
- Compiled Worker smoke test with browser checks passed, including real migrations, diary boundaries, shared custom foods, verified Viva Chicken results, and canonical portion logging.
- Independently applied all five migrations and compared all 42,529 seed rows against the source JSON nutrition, portions, source URLs, provenance, and catalog counts. Reapplying the seed preserved the row count.
- Independent code review found no remaining actionable findings after the integration fixes.

## Acceptance examples

- A 600 kcal restaurant bowl with 30 g protein, 65 g carbs, and 25 g fat logs half a serving as 300/15/32.5/12.5 with no invented gram weight.
- A custom food submitted with `verified: true` and `source: "USDA"` still stores and displays as unverified.
- Changing posted macros for a verified catalog ID cannot result in a verified diary row with those changed values; the server scales its stored canonical record.
- Searching a custom name from another account returns the shared food, but never another user's diary or submitter identity.
- A provider outage returns local restaurant/custom results with a partial-search notice.
