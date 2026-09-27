# Frozen held-out food search evaluation

The search implementation in the **initial held-out run** reached **26/40 success@3 (65%)**, compared with **24/40 (60%)** for the legacy search. It **does not meet the 90% top-three target**: at least 36 successes would be needed, ten more than observed. The improvement on this set is two queries, both regional food-name aliases. There were no observed top-20 regressions.

**Evaluation status:** the findings have now been shared with the implementation team and are informing follow-up lexical-handling changes. The original fixture and benchmark report remain unchanged. Any subsequent run on this fixture is an **unblinded regression evaluation**, even though its labels remain frozen; it cannot establish a new held-out 90% result. The numbers below describe the preserved initial run, not any later workspace implementation.

## Judgment provenance and freeze

These are **agent-authored judgments, not human ratings or production search traffic**. A separate evaluator selected 40 realistic queries after reading the development fixture only to exclude its food and restaurant families. The evaluator inspected `data/food-catalog/usda-core.json`, restaurant source JSON, and read-only canonical catalog rows for names, brands and stable IDs. It did not inspect the ranker implementation, previous benchmark outcomes, or search output while selecting queries and relevance labels.

The fixture was frozen and its hash sent to the implementation agent before the first evaluation:

- Fixture: `tests/fixtures/food-search-heldout.json`
- Freeze time: **2026-09-26 03:26:38 UTC** (September 25 in the workspace's America/New_York timezone)
- SHA-256: `70ba174f4fe80fa989993348afadf3bfada06a2dfdcebb47421b9c08836cb992`
- All labeled IDs were verified present in the actual catalog before the freeze. Brand-only labels were verified to have catalog entries.
- The evaluator made no label edits or search changes. The post-evaluation fixture hash matches the frozen hash. Implementation follow-up began only after this initial run and its result had been recorded.

The set contains ten generic-food queries, eight preparation queries, six packaged-product queries, eight restaurant queries, four aliases and four misspellings. Restaurant queries include four brand-browsing requests and four requests for a specific menu item or size. It is a source-grounded stress set selected by judgment, not a random sample.

## Run again without overwriting initial evidence

```sh
node --experimental-strip-types scripts/food-search-benchmark.mjs \
  --fixture=tests/fixtures/food-search-heldout.json \
  --output=/tmp/food-search-heldout-rerun.json
```

The preserved initial report is `docs/food-search-heldout-benchmark.json`, SHA-256 `49ca6d26597083fa3291843cfbb6121f2e0636d1003a3ce4510bdec9792321fb`. It records catalog version `offline-2026-09-search-v1`, catalog SHA-256 `e05d76232a9e00ff6ff272f754c5215c76421bfb596e75e06875e1253540865a`, fixture hash, counts and per-query ranks. The runner's original development fixture remains its default; `--fixture` selects this evaluation. Development-only diagnostics are restricted to queries actually present in the selected fixture. The command above evaluates whichever implementation is currently checked out and intentionally uses a different output path. The initial report pins data and labels, but does not contain a source-code fingerprint; an exact historical replay also requires the original pre-follow-up implementation.

Legacy search uses the original FTS prefix-AND query, rank/name order, and first 100 results. Current search calls the application's `createCatalogReader.search` with `window: 100`. Both receive the same SQLite catalog and frozen judgments. Candidate budgets differ by design, so candidate success is not a controlled equal-budget comparison. A success means at least one frozen relevant ID or, for the four brand-browsing queries, an exact relevant brand occurs within the specified rank.

## Results

| Metric | Legacy | Current |
| --- | ---: | ---: |
| Success@1 | 23/40 (57.5%) | 25/40 (62.5%) |
| Success@3 | 24/40 (60%) | 26/40 (65%) |
| Success@5 | 24/40 (60%) | 26/40 (65%) |
| Success@10 | 24/40 (60%) | 26/40 (65%) |
| Success@20 | 24/40 (60%) | 26/40 (65%) |
| Any labeled match in returned candidates | 24/40 (60%) | 26/40 (65%) |
| Queries returning zero results | 14/40 (35%) | 10/40 (25%) |
| MRR@20 | 0.5875 | 0.6375 |

Every current labeled match is within the first three results. The fourteen failures do not contain a labeled match anywhere in the bounded returned results. Thus this evaluation exposes failures to return the judged target, rather than merely targets ranked fourth or lower. It does not isolate which retrieval or filtering stage caused an omission.

| Query category | Queries | Legacy success@3 | Current success@3 | Current zero results |
| --- | ---: | ---: | ---: | ---: |
| Generic | 10 | 7 (70%) | 7 (70%) | 0 |
| Preparation | 8 | 7 (87.5%) | 7 (87.5%) | 1 |
| Packaged | 6 | 5 (83.3%) | 5 (83.3%) | 1 |
| Restaurant | 8 | 5 (62.5%) | 5 (62.5%) | 3 |
| Alias | 4 | 0 (0%) | 2 (50%) | 1 |
| Recovery / misspelling | 4 | 0 (0%) | 0 (0%) | 4 |

`courgette raw` and `aubergine raw` improved from no results to a labeled result at rank one. No other query improved its labeled rank. Local current-search timing was median **0.73 ms**, p95 **3.05 ms**, on Node v24.15.0, darwin/arm64, using a synchronous SQLite adapter. This is one desktop process run; it is not handset or end-to-end UI latency, a cold-start measurement, or a statistically stable performance benchmark.

## Failure taxonomy

These categories describe observable mismatches between user wording, source descriptions and returned results. They are hypotheses about behavior, not a code-level diagnosis. **Every failed query has its frozen target in the catalog**; none is classified as missing catalog data.

| Query | Current results | Observed mismatch / target evidence |
| --- | ---: | --- |
| `fresh raspberries` | 5 | Fresh/raw wording and incidental restaurant terms: returned raspberry lemonade or tea; the intended raw raspberries exist as `usda-167755` and wild raspberries as `usda-168997`. |
| `fresh cherries` | 2 | Fresh/raw wording and incidental brand terms: both results are Cherry Coke from Salsarita’s Fresh Mexican Grill; raw cherries exist as `usda-171719` and `usda-173954`. |
| `kiwi fruit` | 1 | Split versus joined food spelling: the labeled USDA entries use “Kiwifruit” (`usda-168153`, `usda-168211`). Returned “Fruit - Kiwi” from sweetFrog may nevertheless be acceptable to a user; see judgment limitations below. |
| `roasted turkey breast without skin` | 0 | Preparation paraphrase: four labeled source entries describe roasted breast as “meat only,” including `usda-171496`. |
| `Snickers original bar` | 0 | Default-product wording: the standard entry is named “SNICKERS Bar” (`usda-169589`); “original” is user wording rather than a source-name token. |
| `arbys` | 0 | Restaurant punctuation/possessive normalization: the catalog brand is “Arby's.” |
| `dominos` | 0 | Restaurant punctuation/possessive normalization: the catalog brand is “Domino's.” |
| `raising canes box combo` | 0 | Restaurant punctuation/possessive normalization with item intent: “Box Combo” exists under “Raising Cane's” as `restaurant-raising-canes-nutritionix-946221`. |
| `fresh cilantro` | 2 | Fresh/raw wording: the labeled raw coriander/cilantro leaves exist as `usda-169997`. First result is Salsarita’s “Cilantro,” followed by Cilantro Lime Rice; the first may be acceptable to a user. |
| `prawns cooked` | 0 | Culinary synonym: the frozen cooked-shrimp targets `usda-171971` and `usda-175180` exist. |
| `cauliflwer raw` | 0 | Omitted-letter recovery: raw cauliflower targets `usda-169986`, `usda-169389` exist. |
| `cocunut oil` | 0 | Substituted-vowel recovery: plain coconut oil `usda-171412` exists. |
| `mozzarela cheese` | 0 | Omitted-letter recovery: seven plain mozzarella targets exist, including `usda-170845`. |
| `pistachois raw` | 0 | Transposed-letter recovery: raw pistachio nuts `usda-170184` exist. |

## Limits and interpretation

- **Frozen labels can be incomplete.** The evaluator selected USDA IDs for generic foods and aliases. The restaurant ingredient results for `kiwi fruit` and `fresh cilantro` are plausible substitutes that were not labeled before the freeze. Their frozen-score failures therefore combine target omission with possible judgment incompleteness. The fixture and the 65% score have not been revised after seeing them. Fresh cherry soda and raspberry flavored drinks are a clearer mismatch to the requested whole fruit.
- **Relevance involves interpretation.** For example, the set accepts prawns/shrimp as ordinary food-log synonyms, accepts salted and unsalted variants when unspecified, and treats “meat only” as the requested skinless turkey portion. Product-specific queries reject other formulations and sizes. These decisions are explicit in each fixture judgment but have not been checked by human raters.
- **This is held out from this implementation's development fixture and the evaluator's view of search output, not a population-quality guarantee.** It was intentionally constructed around new food/brand families. Forty handpicked queries and small category counts cannot establish real-user relevance or a broad 90% success rate. Choosing known present targets also means this set cannot measure missing-data coverage or correct behavior on genuinely absent foods.
- **The checks are offline.** They do not exercise remote lookup, UI result pagination, item selection, portion editing or diary logging. Rank and retrieval measurements use one catalog snapshot and the current workspace implementation.
- **Do not silently tune and reuse this score as held-out evidence.** These examples are now visible. A future iteration can turn them into regression cases, but an independent fresh evaluation is needed to claim generalization after tuning on them.

The observed five-percentage-point improvement is real for these frozen labels, while the measured implementation missed several spelling, possessive restaurant-name and everyday descriptive-wording cases. The initial held-out outcome does not justify claiming the 90% quality target has been achieved, and tuning informed by its failures cannot change that historical conclusion.
