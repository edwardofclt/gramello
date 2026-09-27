# Food search quality

The shared search engine preserves food identities and nutrition while improving which records are retrieved and how they are ordered. Search category is separate from nutrition provenance: a restaurant row imported through Nutritionix remains a restaurant search result even though its `sourceKind` is `database`.

## Retrieval and ranking

`analyzeFoodQuery` normalizes Unicode accents, case, punctuation, source-attested plurals and a small vocabulary of semantic aliases. Examples include `mcdonalds`, `chickfila`, `greek yoghurt`, singular berries, and `low-fat`. Typo suggestions allow only a unique one-edit correction, including adjacent transpositions, within a source-derived food vocabulary indexed by word length. Short terms, ambiguous corrections, known preparations and intentional prefixes are not rewritten. Candidate collection preserves both the original wording and a bounded suggestion. If any eligible candidate strongly matches the original wording, the ranker uses the original and suppresses the correction; this also protects exact custom food names absent from the vocabulary. Only when no strong original exists does the ranker use the suggestion and return it explicitly to the caller.

The generated lexicon contains 5,978 known source words, 3,417 repeated-source suggestion words, 436 attested singular/plural pairs, and 39 possessive spellings derived from restaurant brands. `arbys`, `dominos`, and `raising canes` are handled through source-derived punctuation forms. Rebuild it with `node scripts/food-search-lexicon.mjs`; verify reproducibility with `node scripts/food-search-lexicon.mjs --check`. Only sorted source IDs, food names and brands enter the generator. Relevance labels, query logs, serving sizes and nutrients do not. The artifact includes a source-text SHA-256 and works with existing v1 catalogs without rewriting them.

Semantic aliases remain narrow and reviewable. `kiwi fruit` is an orthographic form of `kiwifruit`; fresh/raw equivalence applies only to simple produce or herb queries, with conflicting frozen, dried, canned, cooked and processed forms excluded. It does not apply to fresh pork or fresh raspberry muffins. For poultry queries, `without skin`, `skinless` and `meat only` share a canonical constraint; explicit `with skin` or `meat and skin` descriptions are excluded, even if a conflicting label also says skinless. No modifier such as `original` is discarded. A shared USDA vocabulary also prevents incidental words such as cheese in Chuck E. Cheese from being treated as explicit restaurant intent in a generic mozzarella query.

Native SQLite search uses the existing v1 FTS index. It retrieves separate USDA, restaurant and other candidate pools, a USDA name-head pool, and reviewed common-food IDs before ranking. Each lane receives the requested window plus one sentinel row; windows grow from 100 to at most 1,000. `searchWindow` reports raw lane saturation even when subsequent filtering removes records. The original `search` interface remains available. No signed installed database is mutated or migrated to enable these query features.

The ranker requires every query token, allows the final token as a typing prefix, and scores whole-token matches above prefix-only matches. Generic queries favor the food itself and common preparations. Explicit restaurant brands receive a strong boost, including exact brand matching rather than incidental overlap. Category and canonical brand filters are applied explicitly. Legacy USDA brand names such as Chobani can be inferred conservatively without modifying stored food data. Open Food Facts identities remain packaged even if their brand field is absent.

IDs are the only deduplication key. Raw/cooked, lowfat/nonfat/whole-milk, breaded/plain, zero/regular, and serving-size variants remain separate. Ranking never edits the food name, provenance, serving description, quantity or nutrients. Installed records override bundled records even when the installed name changed and no longer matches the old search. Bundled search remains available if the installed catalog cannot be read.

Ambiguous imported rows receive a warning. General name-based grouping is forbidden. The only current grouped families are Cook Out beverages whose exact source ID, corrected name, serving label, brand and official source URL match a reviewed tuple. The evidence is in [the source repair audit](restaurant-import/search-description-repairs.json). Old ambiguous `Large` rows and ambiguous Firehouse `Chicken Breast` rows remain ungrouped; all source IDs stay selectable. The root task separately repaired source-reviewed labels and rebuilt the bundled catalog; the search engine does not modify signed downloaded catalogs.

## Reproduce the measurements

Use Node 24 or newer from the repository root:

```sh
node scripts/food-search-benchmark.mjs --output=docs/food-search-benchmark.json
pnpm exec vitest run tests/food-search-relevance.test.ts tests/catalog-fallback.test.ts tests/catalog-builder.test.ts
```

An alternate v1 catalog can be evaluated with `--catalog=/absolute/path/catalog.sqlite`. The benchmark invokes the actual native `createCatalogReader.search` and compares it with the original FTS prefix-AND query ordered by SQLite rank and food name, capped at 100. Both use the same catalog. The report records catalog and fixture SHA-256 values, catalog version, all query observations, diagnostics, and regressions. Node may print a module-type warning for the mobile package; it does not change the measured results.

The 100-query fixture contains agent-authored relevance judgments taken from source food descriptions and explicit restaurant intent. Expected IDs and brands were specified independently of ranker output. The fixture was subsequently used for tuning and is a **development regression set**, not a held-out set or human-rated study. Common foods, preparations, singular/plural forms, four alias/accent/typo cases, and 25 explicit restaurant queries are represented. It is not representative of all packaged products, long-tail queries or user behavior.

A query succeeds at k when at least one independently specified relevant food appears among its first k results. This is success rate, not precision, comprehensive recall or nutritional equivalence. Restaurant-only queries accept a menu item from the requested brand; they do not assert that every menu item is correctly described. MRR@20 is mean reciprocal rank of the first relevant result, assigning zero beyond 20. Candidate success is measured separately; the current method intentionally uses larger, category-balanced bounded pools than the legacy method.

| Metric, 100 queries | Legacy | Current |
| --- | ---: | ---: |
| Success@1 | 39 | 76 |
| Success@3 | 57 | 89 |
| Success@5 | 63 | 97 |
| Success@10 | 68 | 100 |
| Success@20 | 74 | 100 |
| Queries with a relevant candidate | 85 | 100 |
| Empty-result queries | 5 | 0 |
| MRR@20 | 0.4912 | 0.8379 |

There are no legacy top-20 successes that became current top-20 failures in this fixture. The proposed 90% held-out Success@3 target is **not established**: measured development Success@3 is 89%, and [final independent validation](food-search-validation-quality.md) reached 87.5%.

| Query / diagnostic record | Legacy uncapped rank | Current rank |
| --- | ---: | ---: |
| egg — whole, raw, fresh (`usda-171287`) | 120 | 1 |
| rice — white, long-grain, enriched, cooked (`usda-168878`) | 206 | 2 |
| chicken breast — meat only, cooked, roasted (`usda-171477`) | 54 | 1 |
| mcdonalds — a McDonald's item | no results | 1 |
| chickfila — a Chick-fil-A item | no results | 1 |
| greek yoghurt — plain Greek yogurt | no results | 1 |
| chikcen breast — plain chicken breast | no results | 1 |

The earliest judged egg record had legacy rank 116, while the specific raw whole egg above was rank 120. Current rice has a judged brown-rice record first and the white-rice diagnostic second. These distinctions are preserved in the JSON report rather than substituting the best family rank for a specific record.

Latency in the report is local Node/SQLite adapter time, not device or hosted-request latency. The latest run is roughly 5 ms median and 31 ms p95 on Node 24, macOS arm64; values vary between runs. No mobile latency claim is made.

## Independent stress evaluation and subsequent diagnostic retest

The original independent 40-query stress evaluation is preserved byte-for-byte in [food-search-heldout-benchmark.json](food-search-heldout-benchmark.json): legacy Success@3 was 24/40 (60%) and the initial implementation achieved 26/40 (65%). That result exposed insufficient vocabulary and alias coverage. A snapshot of the initial engine and a SHA-256 verification record are retained in the task's implementation evidence.

After that corpus was unblinded, source-derived lexical recovery and constrained semantic aliases were developed. The separate [diagnostic retest](food-search-diagnostic-retest.json) achieves 39/40 Success@3 (97.5%) and 38/40 Success@1. This is **development/diagnostic evidence after tuning, not a new held-out result**. The benchmark refuses to overwrite the original held-out report. Reproduce this explicitly labeled diagnostic run with:

```sh
node scripts/food-search-benchmark.mjs --fixture=tests/fixtures/food-search-heldout.json --diagnostic-retest --output=docs/food-search-diagnostic-retest.json
```

The remaining diagnostic failure is `Snickers original bar`: the source names a Snickers bar but does not explicitly establish the original formulation. Search preserves the original modifier rather than silently substituting a different or unspecified variant. Source labels and relevance labels were not changed to raise the score.

After engine freeze, a separate agent evaluated 40 newly selected queries with source-grounded labels frozen before execution. [Final validation](food-search-validation-quality.md) improved top-three success from 25/40 (62.5%) to 35/40 (87.5%), and reduced empty results from 13 to 3. It falls one query short of the proposed 90% top-three target. No tuning followed this evaluation. The report discloses one query that also appeared in an earlier handwritten regression, remaining alias gaps, and a Gatorade G2 rank-one-to-five regression. This is independent agent-authored validation, not a human-rated or production-traffic study.

## Limits and follow-up

- Recognition of legacy packaged USDA names is curated; unknown brands may remain generic until reviewed. Source provenance is retained regardless.
- Typo handling deliberately avoids broad fuzzy matching. Unknown aliases and ambiguous corrections can still yield no matches.
- Broad search windows are bounded. Expansion means more candidates may exist, not that every additional candidate will survive filters.
- Every query modifier still participates in matching. Common-food boosts cannot turn a raw result into cooked, a regular drink into zero sugar, or one serving size into another.
- Source ambiguity is not solved by rank alone. Firehouse ambiguous size rows still require source verification, and Cook Out omitted duplicate source rows were not recreated.
- A future independent, human-judged held-out set should cover packaged products, mixed restaurant/item queries, spelling errors and queries outside this corpus before claiming production relevance targets.
