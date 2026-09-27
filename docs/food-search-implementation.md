# Food search implementation and validation

The food picker now shares retrieval and ranking rules across browser-local web, the retained hosted API, and native, searches the saved catalog while typing, and automatically expands to online providers after a short pause. The implementation focuses on finding the right food rather than repeat-logging shortcuts.

## Delivered

- Category-aware candidate retrieval prevents restaurant-heavy catalogs from hiding common foods. Shared normalization, lexical recovery, exact-word preference and food-specific ranking preserve preparations and source identities.
- All, Generic, Packaged, Restaurants and custom-food filters work, with brand refinement. Native and main-web personal foods are labeled My foods; the Expo client using the retained hosted API labels shared records Community foods.
- The list begins with 20 results, supports stable continuation, and can explicitly expand its candidate window. Visible notices distinguish refreshed results, provider limits, unavailable services, and spelling suggestions.
- Both pickers retain the query and list while choosing an amount. Back restores the results position. Source-reviewed beverage variants reveal exact selectable serving records; ambiguous menu rows remain separate and show warnings.
- Accepted online records are persisted before selection. Logging checks the reviewed canonical record, so a provider refresh cannot silently change the portion the user saw. Existing diary entries and food IDs remain intact.
- Hosted FTS indexes and 7,793 USDA foods provide immediate generic coverage. Thirty-five Cook Out descriptions were repaired from the official nutrition PDF without changing nutrition or IDs. The bundled catalog still contains 50,322 records and uses schema version 1; installed signed catalogs remain compatible.
- Provider lookups use bounded caching, request coalescing, cancellation isolation and backoff. Hosted OFF requests use a shared D1 quota; server configuration controls hosted online availability. No search-query telemetry was introduced.

## Evaluation discipline

The original 100-query source-judged set was used during development. It is not held-out evidence. A separate agent then froze 40 queries and labels from source data before executing the ranker; the initial result was 65% top-three success versus 60% for the legacy search. That evaluation exposed lexical coverage gaps and informed a subsequent implementation pass. The initial result and labels are preserved; later runs against those 40 queries are diagnostic retests, not new held-out evidence.

The diagnostic retest after those improvements reached 39/40 top-three successes. A final independently authored 40-query validation then ran after engine freeze, with no subsequent tuning:

| Metric | Legacy | Final implementation |
| --- | ---: | ---: |
| Development set: acceptable result in top three | 57/100 | 89/100 |
| Development set: acceptable result in top ten | 68/100 | 100/100 |
| Independent validation: acceptable result in top three | 25/40 (62.5%) | 35/40 (87.5%) |
| Independent validation: empty results | 13/40 | 3/40 |

See [development quality](food-search-quality.md), [preserved initial evaluation](food-search-heldout-quality.md), and [final independent validation](food-search-validation-quality.md) for exact metrics, judgments, reproduction commands and limitations. The final report discloses one query that overlapped a handwritten regression outside the excluded development fixtures. At least one relevant result at a rank is the metric; it does not establish that all returned foods are appropriate or nutritionally interchangeable.

## Verification before syncing main

- Full Vitest suite: **446 tests passed across 36 files**.
- Hosted Playwright: **33 passed, 3 existing conditional skips**, desktop and phone viewports. Skips cover a phone-specific test under the desktop project and two optional real-container restart cases.
- Expo browser Playwright: **29 passed**, including diary, meals/ingredients, barcode, custom foods, layout, variant persistence and deep-scroll restoration.
- Root and mobile TypeScript checks passed. Full ESLint passed with zero errors and three preexisting image/default-export warnings.
- Production web build and iOS/Android Hermes bundle exports passed.
- Compiled Worker smoke passed against disposable D1 databases with every migration applied, including staple retrieval, cursor continuity and canonical logging.
- Thirty sequential indexed requests in the local compiled Worker measured **17.4 ms median and 33.4 ms p95**, including loopback HTTP. These are local runtime measurements, not production or handset guarantees.
- Deterministic source lexicon check and independent code review passed. Review fixes include correction overreach, missing brandless packaged rows, native and hosted Back scroll state, provider-cap presentation, and canonical barcode-cache precedence.

## Integration with main on September 26

The search work was reapplied to `266c58c` (`feat(web): bring browser app to mobile parity`). The main web app now runs the native repository and food catalog inside a SQLite Web Worker, with browser-local persistence. Search options, candidate windows, continuation cursors, cancellation, and source status cross those adapters. Online results are saved within the active cache snapshot before the UI can select them, including when retrying after a failed durable save.

Main's serving-size picker and USDA serving defaults are preserved. Logging validates the selected canonical serving, and quantity conversions retain the portion already chosen. The bundled catalog was rebuilt from the combined source data, retaining its 50,322 records and v1 schema. Tests for older installed catalogs use an explicit legacy fixture rather than assuming the current bundle still has old defaults.

The compatibility merge also preserves main's joined-apostrophe retrieval and exact-match candidate coverage. The quality numbers above describe the pre-merge evaluation artifacts; they have not been reclassified or silently regenerated against this combined build.

Integrated-build verification:

- **574 unit tests passed across 49 files**, including browser adapter and cache snapshot lifecycle coverage.
- **49 browser scenarios passed** across desktop and phone viewports, with one desktop skip for the phone-only scrolling case. The full run passed 48 scenarios; the remaining test had an obsolete 24-result expectation, was updated to load the second page, and passed its targeted rerun.
- Root/mobile TypeScript, ESLint (three existing warnings), production build, and the compiled hosted API smoke test passed. The HTTP smoke now checks the browser-local loading shell; browser tests verify the hydrated diary.
- Real-worker search checks cover category and brand filters, paging, online persistence, canonical serving logging, expanded variants, Back position, and reload persistence. The rebuilt catalog passed integrity validation and the deterministic lexicon check.

Main's compatibility fallback still scans apostrophe-containing catalog names. Caching an index for immutable catalog readers is a performance follow-up; mutable provider caches must retain fresh snapshot reads.

## Unified search interaction

Following preview feedback, the separate online-search action was removed from both pickers. The saved catalog is queried after 100 ms; online expansion follows after 900 ms of idle time and only after the local request settles. Restaurant and custom-food filters use saved sources only. Enter expedites a pending search, including after returning from an amount view, without duplicating an already completed lookup.

Automatic expansion retains a rolling budget of ten distinct normalized queries per minute, allowing cached repeated queries without consuming another slot. When the budget is full, only the latest pending query is eligible once a slot opens. Provider caches, shared-work cancellation isolation, and backend quotas remain in place. Choosing a food, entering scanner/custom entry, or requesting another page cancels pending automatic work so it cannot replace the user's current results. Returning from a saved custom food or barcode match refreshes once; ordinary Back preserves the list.

Pagination can interrupt an in-flight background lookup. Continuation requests reuse completed, unexpired provider results or the persistent food cache and never start another provider request. This prevents a provider outage from delaying each page while preserving the cursor's original search identity.

Verification after this change: **593 unit tests passed**, **13 targeted web browser checks passed** across desktop and phone viewports (one desktop skip for the phone-only case), and **three Expo search scenarios passed**. The targeted web run includes the scrolling failure found in the broader run and a new provider-outage pagination regression. Root/mobile TypeScript, production build, compiled API smoke, and ESLint passed with the three existing warnings. The focus-restoration test now awaits Radix's deferred close callback, and generated Playwright reports/traces are excluded from source linting.

## Branding and final release verification

The app and web wordmarks now use `gramello.` with an accented period, matching the website. Browser metadata, the startup screen, Expo's display name, and the website's illustrated app header use the same lowercase name with a period. The native home-screen label takes effect in the next app binary.

Final verification on the combined search and branding changes:

- **593 unit tests passed across 49 files**.
- **51 browser scenarios passed** across desktop and phone viewports, with one desktop skip for the phone-only scrolling case.
- Root/mobile TypeScript and full ESLint passed with zero errors and the three existing warnings.
- Production web build, compiled hosted API smoke, and iOS/Android Hermes exports passed.
- Website build and deterministic source lexicon check passed. The refreshed local web preview was visually checked for the new wordmark.
- Final independent review found no release blockers or unrelated changes.

## Deployment requirements

Apply the additive hosted migrations in order:

1. `0006_food_search.sql`: FTS index, maintenance triggers and shared provider quota.
2. `0007_usda_core.sql`: idempotent USDA core seed that preserves existing newer canonical rows.
3. `0008_food_description_repairs.sql`: source-reviewed name repairs guarded by source ID, old name and URL.

Set server-only `USDA_API_KEY` for retained hosted USDA expansion. Hosted Open Food Facts name search is opt-in with `OFF_SEARCH_ENABLED=1`; its D1 quota is required. The browser-local and native clients use direct Open Food Facts expansion and do not require these server flags. Local indexed search remains usable when a provider is unavailable. Never place the USDA key in a client bundle.

No production migration, deployment, provider configuration or catalog-feed publication was performed by this task. Reverting application code leaves the additive storage changes readable; valid source description repairs and historical diary snapshots should be preserved. Native downloaded catalogs are not rewritten.

## Release boundaries

The proposed 90% top-three target is **not met** by the final 87.5% validation result. Remaining cases include green-onion target retrieval, rocket/arugula and capsicum/pepper aliases, and the spelling “fetta”; Gatorade G2 also moved from first to fifth. Agent-authored fixtures are not a human-rated user study. Physical-device cold/warm latency and screen-reader verification are separate release checks; Node SQLite timing, Expo browser tests and native bundle exports cannot establish those device properties.

Generic/packaged coverage is still bounded by the approved catalog and provider limits. Unknown aliases and genuinely missing foods need refinement, barcode lookup or custom entry. Ambiguous Firehouse descriptions and omitted duplicate Cook Out source rows were not invented or merged. Favorites, recents, multi-add and broad catalog refreshes remain follow-ups from the approved scope.
