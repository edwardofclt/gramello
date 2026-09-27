# Final blind food-search validation

The frozen current search found an accepted target in the first three results for **35/40 queries (87.5%)**, compared with **25/40 (62.5%)** for the legacy search. It falls one query short of the proposed **90% top-three target**. The secondary top-five result is 36/40 (90.0%); that does not satisfy or replace the top-three target. These are agent-authored relevance judgments over a small, deliberately balanced, nonrandom set with known source targets, not an accuracy estimate for real users.

## Method and freeze

A separate evaluation agent authored one fresh 40-query fixture from raw USDA/restaurant JSON and read-only rows in the shipped SQLite `foods` table. It read the two earlier fixtures only to exclude their named food, restaurant and query families. Before freezing labels, it inspected neither implementation nor earlier benchmark reports and issued no FTS or ranking queries. Source-grounded equivalent canonical targets were accepted in advance. All accepted IDs exist in the canonical catalog; no accepted IDs or query strings overlap either earlier fixture. Distinct foods such as halibut versus cod and feta versus mozzarella were treated as separate food families, rather than excluding whole nutritional groups.

After evaluation, the coordinating agent disclosed that **`green onions` already appeared in a handwritten lexical regression outside the two audited fixtures**. That regression checked literal words/typos, not this fixture's accepted target IDs. The evaluation agent's query and label selection was blinded to that test, but this one query was not unseen by the implementation work overall. The family-exclusion audit therefore does not establish that all 40 query strings were unseen across every prior engineering artifact. The fixture and score are preserved unchanged.

- Labels frozen and hash sent to the coordinating agent: **2026-09-26 03:37:09 UTC**.
- Fixture: [`tests/fixtures/food-search-validation.json`](../tests/fixtures/food-search-validation.json).
- Fixture SHA-256: `ea9da48dc948444d32526a53e232044d4aab67bd49fc194397eef88334505008`.
- Catalog SHA-256: `e05d76232a9e00ff6ff272f754c5215c76421bfb596e75e06875e1253540865a`.
- The coordinating agent confirmed the engine was frozen before evaluation. The validation fixture was then evaluated exactly once, with no subsequent label or engine tuning.
- Machine output: [`food-search-validation-benchmark.json`](food-search-validation-benchmark.json).

The existing runner compares legacy FTS prefix-AND search (first 100 candidates, original rank/name ordering) with the actual `createCatalogReader.search` result and shared ranking (100 per candidate lane). Success at *k* means at least one accepted result appears within the first *k* positions; it is not precision over all displayed results. Candidate pools have different bounded budgets by design.

Reproducible command used for the single validation run:

```sh
node scripts/food-search-benchmark.mjs --fixture=tests/fixtures/food-search-validation.json --output=docs/food-search-validation-benchmark.json
```

An initial invocation with space-separated option values silently ran the default 100-query development fixture. Its stdout identified the default fixture; it neither evaluated this 40-query fixture nor wrote this report. The corrected invocation above was the only validation run. The unmodified runner labels non-special-case filenames as `Development evaluation`; that generic metadata field in the raw JSON does not describe the independently frozen protocol documented here.

## Results

| Metric | Legacy | Current |
| --- | ---: | ---: |
| Success at 1 | 20/40 (50.0%) | 29/40 (72.5%) |
| Success at 3 | 25/40 (62.5%) | 35/40 (87.5%) |
| Success at 5 | 25/40 (62.5%) | 36/40 (90.0%) |
| Success at 10 | 26/40 (65.0%) | 36/40 (90.0%) |
| Success at 20 | 26/40 (65.0%) | 36/40 (90.0%) |
| Accepted target in candidate pool | 26/40 (65.0%) | 36/40 (90.0%) |
| Zero-result queries | 13/40 (32.5%) | 3/40 (7.5%) |
| Mean reciprocal rank at 20 | 0.5661 | 0.7967 |

| Category | Queries | Legacy at 5 | Current at 1 | Current at 3 | Current at 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| generic | 10 | 7/10 | 7/10 | 10/10 | 10/10 |
| preparation | 8 | 8/8 | 7/8 | 8/8 | 8/8 |
| packaged | 6 | 4/6 | 4/6 | 5/6 | 6/6 |
| restaurant | 8 | 5/8 | 8/8 | 8/8 | 8/8 |
| alias | 4 | 1/4 | 1/4 | 1/4 | 1/4 |
| recovery | 4 | 0/4 | 2/4 | 3/4 | 3/4 |

Restaurant coverage comprises four brand-browsing queries and four specific menu-item requests, all successful at rank one. The current implementation preserves all 25 legacy top-five successes and adds 11. There is one early-ranking regression: **Gatorade G2** falls from accepted rank 1 to rank 5, so the absence of top-five regressions should not be read as the absence of every ranking regression.

## Failures and limits

| Query | Frozen requested target | Observed outcome |
| --- | --- | --- |
| `green onions` | Raw spring onions/scallions (`usda-170005`) | 16 candidates returned, none accepted |
| `rocket leaves` | Raw arugula (`usda-169387`) | Zero results |
| `red capsicum raw` | Raw red sweet pepper (`usda-170108`) | Zero results |
| `fetta cheese` | Feta cheese (`usda-173420`) | Zero results |

All four misses lack an accepted target in the current bounded candidate pool, so they are retrieval/recovery misses under this protocol rather than merely targets placed below the display cutoff. The alias subgroup succeeds for only 1/4 queries; the overall 90% top-five result therefore does not imply strong synonym coverage. These observations identify remaining limits, without claiming a code-level root cause or proposing label changes.

Current latency was **1.70 ms median / 33.43 ms p95** in this single run on Node v24.15.0, darwin/arm64, using a local synchronous SQLite adapter. These are not device measurements, production latency guarantees or a repeated timing study. The fixture tests only catalog-present targets, not missing products, personalized intent, barcode search, multilingual coverage or unseen restaurant catalogs. Human ratings and live user behavior were not collected.
