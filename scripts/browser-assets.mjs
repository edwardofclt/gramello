import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

export async function prepareBrowserAssets() {
  const root = new URL('../', import.meta.url);
  const output = new URL('public/offline/', root);
  await mkdir(output, { recursive: true });
  await build({
    entryPoints: [new URL('lib/browser-local/worker.ts', root).pathname],
    outfile: new URL('diary-worker.js', output).pathname,
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    minify: true, sourcemap: false, logLevel: 'warning',
  });
  const require = createRequire(import.meta.url);
  await copyFile(require.resolve('@sqlite.org/sqlite-wasm/sqlite3.wasm'), new URL('sqlite3.wasm', output));
  const catalog = await readFile(new URL('mobile/assets/catalog.sqlite', root));
  await writeFile(new URL('catalog.sqlite.gz', output), gzipSync(catalog, { level: 9 }));
  await writeFile(new URL('catalog-meta.json', output), JSON.stringify({
    sha256: createHash('sha256').update(catalog).digest('hex'), bytes: catalog.length,
  }));
}
