import { createReadStream, readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { buildCatalog } from './food-catalog.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
/** @param {{ usda?: string, off?: string, output: string, baseUrl: string, buckets?: number }} options */
export async function buildFoodPacks({ usda, off, output, baseUrl, buckets = 128 }) {
  if (!Number.isInteger(buckets) || buckets < 1 || buckets > 256) throw new Error('Invalid partition count');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Pack URLs must use HTTPS');
  if (existsSync(output)) throw new Error('Choose a fresh output directory');
  mkdirSync(output, { recursive: true });
  // Bundle the shared, tested TypeScript normalizers; no separate importer rules.
  const compiled = await build({ entryPoints: [fileURLToPath(new URL('../lib/catalog-import.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
  const { normalizeUsdaBranded, normalizeOffProduct } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  /** @type {import('../mobile/src/catalog/packs').FoodPack[]} */
  const packs = [];
  const reports = {};
  for (const [source, input, normalize] of [['usda-branded', usda, normalizeUsdaBranded], ['off', off, normalizeOffProduct]]) {
    if (!input) continue;
    // Disk-backed staging avoids retaining a million foods or the 3GB USDA JSON.
    mkdirSync(join(output, '.staging'), { recursive: true });
    const stage = new DatabaseSync(join(output, '.staging', `${source}.sqlite`));
    let seen = 0, accepted = 0;
    try {
      stage.exec('CREATE TABLE items(id TEXT PRIMARY KEY,bucket INTEGER,food TEXT); BEGIN');
      const insert = stage.prepare('INSERT INTO items VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET food=excluded.food,bucket=excluded.bucket');
      const lines = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line.trim()) continue;
        const raw = JSON.parse(line); seen++;
        const food = normalize(raw);
        if (!food) continue;
        const bucket = Number(BigInt(food.barcodes[0]) % BigInt(buckets));
        insert.run(food.id, bucket, JSON.stringify(food)); accepted++;
      }
      if (!accepted) throw new Error(`${source} contains no valid US products; investigate the source before publishing`);
      stage.exec('COMMIT; CREATE INDEX items_bucket ON items(bucket,id)');
      for (let bucket = 0; bucket < buckets; bucket++) {
        const foods = stage.prepare('SELECT food FROM items WHERE bucket=? ORDER BY id').all(bucket).map(row => JSON.parse(row.food));
        if (!foods.length) continue;
        const id = `${source}-${buckets}-${bucket}`, version = `${id}-${sha256(JSON.stringify(foods)).slice(0,24)}`;
        const file = join(output, `${id}.building.sqlite`);
        buildCatalog(foods, file, version, source);
        const bytes = readFileSync(file);
        if (bytes.length > 32 * 1024 * 1024) throw new Error(`${id} exceeds 32 MiB; increase --buckets and rebuild`);
        const contentHash = sha256(bytes), filename = `${id}-${contentHash}.sqlite`;
        renameSync(file, join(output, filename));
        packs.push({ schemaVersion: 1, id, source, market: 'US', license: source === 'off' ? 'ODbL-1.0' : 'CC0-1.0', bucket, buckets,
          version, url: new URL(filename, baseUrl).href, sha256: contentHash, bytes: bytes.length, count: foods.length });
      }
      reports[source] = { seen, accepted, unique: Number(stage.prepare('SELECT COUNT(*) count FROM items').get().count), rejected: seen - accepted };
    } finally { stage.close(); }
  }
  if (!packs.length) throw new Error('No valid US products were imported');
  const result = { schemaVersion: 2, version: `us-${sha256(JSON.stringify(packs)).slice(0,32)}`, publishedAt: new Date().toISOString(), packs };
  writeFileSync(join(output, 'pack-set.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(output, 'import-report.json'), JSON.stringify(reports, null, 2) + '\n');
  return result;
}

export function signPackSet(manifest, pem, publicKey) {
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519' || createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex') !== publicKey) throw new Error('Signing key does not match the app trust key');
  const payload = JSON.stringify(manifest);
  return { payload, signature: sign(null, Buffer.from(payload), key).toString('hex') };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [usda, off, output, baseUrl, partitions] = process.argv.slice(2);
  const result = await buildFoodPacks({ usda, off, output, baseUrl, buckets: partitions ? Number(partitions) : 128 });
  if (process.env.CATALOG_SIGNING_KEY) {
    const config = JSON.parse(readFileSync('mobile/catalog-config.json', 'utf8'));
    writeFileSync(join(output, 'pack-manifest.json'), JSON.stringify(signPackSet(result, process.env.CATALOG_SIGNING_KEY, config.publicKey)) + '\n');
  }
  console.log(`Built ${result.packs.length} packs, ${result.packs.reduce((sum, pack) => sum + pack.count, 0)} US products, ${result.packs.reduce((sum, pack) => sum + pack.bytes, 0)} bytes`);
}
