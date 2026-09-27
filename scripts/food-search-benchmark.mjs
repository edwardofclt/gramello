/** Reproducible offline retrieval benchmark, Node >=24. No requests or query logging. */
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Node strips TS types; resolve the application's bundler-style relative imports.
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      for (const suffix of ['.ts', '/index.ts']) if (existsSync(base + suffix)) return nextResolve(pathToFileURL(base + suffix).href, context);
    }
    throw error;
  }
} });
const { createCatalogReader } = await import('../mobile/src/catalog/queries.ts');
const catalogPath = resolve(process.argv.find(arg => arg.startsWith('--catalog='))?.slice(10) ?? 'mobile/assets/catalog.sqlite');
const fixturePath = resolve(process.argv.find(arg => arg.startsWith('--fixture='))?.slice(10) ?? 'tests/fixtures/food-search-relevance.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const diagnosticRetest = process.argv.includes('--diagnostic-retest');
const raw = new DatabaseSync(catalogPath, { readOnly: true });
const db = {
  async getAllAsync(sql, ...params) { return raw.prepare(sql).all(...params); },
  async getFirstAsync(sql, ...params) { return raw.prepare(sql).get(...params) ?? null; },
};
const reader = createCatalogReader(work => work(db));
function legacy(query, limit = 101) {
  const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0,10) ?? [];
  if (!tokens.length) return [];
  return raw.prepare('SELECT f.food FROM food_search s JOIN foods f ON f.id=s.id WHERE food_search MATCH ? ORDER BY rank,f.name LIMIT ?')
    .all(tokens.map(t => `"${t}"*`).join(' AND '), limit).map(row => JSON.parse(row.food));
}
const relevant = (food, judgment) => judgment.relevantIds?.includes(food.id) || (judgment.relevantBrand && food.brand === judgment.relevantBrand);
const rank = (foods, judgment) => { const i = foods.findIndex(food => relevant(food,judgment)); return i < 0 ? null : i + 1; };
const observations = [];
try {
  for (const judgment of fixture.queries) {
    const before = legacy(judgment.query).slice(0,100);
    const start = performance.now();
    const after = await reader.search(judgment.query, { window:100 });
    observations.push({query:judgment.query,kind:judgment.kind,legacyRank:rank(before,judgment),currentRank:rank(after,judgment),legacyCount:before.length,currentCount:after.length,currentMs:performance.now()-start});
  }
  const summarize = side => ({
    successAt1:observations.filter(row => row[side+'Rank'] !== null && row[side+'Rank'] <= 1).length,
    successAt3:observations.filter(row => row[side+'Rank'] !== null && row[side+'Rank'] <= 3).length,
    successAt5:observations.filter(row => row[side+'Rank'] !== null && row[side+'Rank'] <= 5).length,
    successAt10:observations.filter(row => row[side+'Rank'] !== null && row[side+'Rank'] <= 10).length,
    successAt20:observations.filter(row => row[side+'Rank'] !== null && row[side+'Rank'] <= 20).length,
    candidateSuccess:observations.filter(row => row[side+'Rank'] !== null).length,
    zeroResults:observations.filter(row => row[side+'Count'] === 0).length,
    mrrAt20:Number((observations.reduce((sum,row) => sum + (row[side+'Rank'] !== null && row[side+'Rank'] <=20 ? 1/row[side+'Rank'] : 0),0)/observations.length).toFixed(4)),
  });
  const sortedMs = observations.map(row=>row.currentMs).sort((a,b)=>a-b);
  const diagnosticQueries = ['egg','rice','chicken breast','mcdonalds','chickfila','greek yoghurt','chikcen breast']
    .filter(query => fixture.queries.some(row => row.query === query));
  const diagnostics = await Promise.all(diagnosticQueries.map(async query => {
    const target = fixture.queries.find(row=>row.query===query);
    const row = observations.find(row=>row.query===query);
    const allLegacy = legacy(query, 100000);
    const diagnosticId = ({egg:'usda-171287',rice:'usda-168878','chicken breast':'usda-171477'})[query];
    const known = diagnosticId ? {relevantIds:[diagnosticId]} : null;
    return {...row,legacyUncappedRank:rank(allLegacy,target),legacyUncappedCount:allLegacy.length,
      ...(known ? {diagnosticId,legacyDiagnosticRank:rank(allLegacy,known),currentDiagnosticRank:rank(await reader.search(query,{window:100}),known)} : {})};
  }));
  const report = {
    fixtureFile:relative(process.cwd(),fixturePath),
    catalogSha256:createHash('sha256').update(readFileSync(catalogPath)).digest('hex'),
    fixtureSha256:createHash('sha256').update(readFileSync(fixturePath)).digest('hex'),
    catalogVersion:raw.prepare("SELECT value FROM catalog_meta WHERE key='version'").get()?.value,
    queryCount:observations.length,judgmentMethod:diagnosticRetest ? `${fixture.judgmentMethod} This rerun occurs after the set was unblinded and used for development; the original no-tuning evaluation is preserved separately. These rerun results are diagnostic only.` : fixture.judgmentMethod,
    evaluationPhase:diagnosticRetest ? 'Diagnostic/development retest after unblinding; not held-out evidence' : 'Development evaluation',
    method:'Same SQLite catalog and fixed judgments. Legacy: original FTS prefix AND, rank/name order, first 100. Current: actual createCatalogReader.search, window=100 per candidate lane, shared rank; evaluate same top-k. Candidate success has different bounded budgets by design.',
    legacy:summarize('legacy'),current:summarize('current'),
    currentLatencyMs:{median:Number(sortedMs[Math.floor(sortedMs.length/2)].toFixed(2)),p95:Number(sortedMs[Math.floor(sortedMs.length*.95)].toFixed(2)),environment:`Node ${process.version}, ${process.platform}/${process.arch}; local synchronous SQLite adapter, not device timing`},
    diagnostics,regressions:observations.filter(row=>row.legacyRank !== null && row.legacyRank <=20 && (row.currentRank === null || row.currentRank>20)),observations,
  };
  const output = process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);
  if (output && resolve(output) === resolve('docs/food-search-heldout-benchmark.json') && existsSync(resolve(output))) throw new Error('The original held-out report is immutable; write a separate diagnostic report.');
  if (output) writeFileSync(resolve(output), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,observations:undefined},null,2));
} finally { raw.close(); }
