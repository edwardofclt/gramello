# Shared food search index

The user approved a single local search index across downloaded food chunks. Full
verification stays in installation. Original SQLite packs retain canonical foods
and barcode mappings; search retrieves candidates centrally and reads complete
records only from matching packs. The existing small core and personal/provider
catalogs keep their readers and participate in final shared relevance ranking.

The index stores IDs, names, brands, source metadata and pack generation locations.
FTS text uses the same normalization as ranking, including apostrophe and accent
folding. Pack generations are indexed before activation; searches filter against
the current durable activation ledger, so staged/failed and retired generations
cannot leak into results. New generations override older identities even when a
rename means the new name no longer matches the query.

Native keeps a writable derived SQLite database outside the personal queue.
Browser keeps the same database in OPFS, with a durable IndexedDB snapshot fallback
when direct OPFS is unavailable. Readers and updates share existing storage locks.
Existing validated downloads are indexed during the updater's preparation pass,
including offline/backoff checks. Searches never build or verify the index and
return an actionable partial-results message while preparation is incomplete.

Implementation and verification:

- [x] Add shared SQLite indexing and candidate retrieval, with real SQLite tests
  for matching, apostrophes, brands, bounded hydration, generation precedence,
  failed activation, retirement, interruption rollback and cancellation.
- [x] Add native and browser persistence adapters; index downloads before
  activation and prepare older downloads outside the search path. Verify restart,
  offline preparation, concurrent updates and failed durable commits.
- [x] Wire the shared candidate search into native/browser catalog readers.
  Verify that nonmatching packs are never opened and no per-pack search runs.
- [x] Run the complete test suite, browser storage/core regressions, root/mobile
  type checks, production build, and benchmark the real downloaded corpus.
- [x] Document the lifecycle and measured limits; remove temporary dependency
  links used for verification.

Review focus: missing/corrupt derived storage; old and new partition overlap;
renamed duplicate identities; index writes that succeed before activation fails;
and unavailable canonical packs after candidate selection. All must preserve
canonical source values and visible partial-result errors.
