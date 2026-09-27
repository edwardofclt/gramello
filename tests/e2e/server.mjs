// Disposable Worker and database for browser diary tests; no real data.
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { ghostProduct } from '../fixtures/ghost-energy.ts';
const directory = await mkdtemp(join(tmpdir(), 'gramello-browser-'));
const state = join(directory, 'data');
const envFile = join(directory, '.env.test');
const args = ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js'];
await writeFile(envFile, 'APP_BASE_URL=http://127.0.0.1:5198', { mode: 0o600 });
try {
  for (const file of (await readdir('drizzle')).filter(name => name.endsWith('.sql')).sort()) {
    const result = spawnSync(process.execPath, [...args, 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', state, '--file', `drizzle/${file}`], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }
  // The browser barcode fixture intercepts the response, so seed the same
  // accepted provider record that the real barcode endpoint persists first.
  // Logging then exercises canonical nutrition and the reviewed-food revision.
  const literal = value => typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
  const barcodeSeed = join(directory, 'barcode-fixture.sql');
  const nutrients = ghostProduct.nutriments;
  const values = [`off-${ghostProduct.code}`, ghostProduct.product_name, 'Open Food Facts', 'database',
    `https://world.openfoodfacts.org/product/${ghostProduct.code}`, 1, '100ml',
    ghostProduct.serving_quantity, ghostProduct.serving_size, nutrients['energy-kcal_100g'],
    nutrients.proteins_100g, nutrients.carbohydrates_100g, nutrients.fat_100g, '2026-09-20'];
  await writeFile(barcodeSeed, `INSERT INTO foods(id,name,source,source_kind,source_url,verified,nutrition_basis,serving_ml,serving_label,calories,protein,carbs,fat,created_at) VALUES(${values.map(literal).join(',')});`);
  const seeded = spawnSync(process.execPath, [...args, 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', state, '--file', barcodeSeed], { encoding: 'utf8' });
  if (seeded.status !== 0) throw new Error(seeded.stderr);
  const server = spawn(process.execPath, [...args, 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', state, '--env-file', envFile, '--ip', '127.0.0.1', '--port', '5198', '--inspector-port', '0'], { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill('SIGTERM'));
  await new Promise(resolve => server.once('exit', resolve));
} finally { await rm(directory, { recursive: true, force: true }); }
