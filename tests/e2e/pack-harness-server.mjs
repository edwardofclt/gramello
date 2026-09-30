import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { build } from 'esbuild';
import { buildFoodPacks, signPackSet } from '../../scripts/food-packs.mjs';
const temporary = await mkdtemp(join(tmpdir(), 'gramello-pack-browser-'));
const require = createRequire(import.meta.url), wasm = require.resolve('@sqlite.org/sqlite-wasm/sqlite3.wasm');
const key = generateKeyPairSync('ed25519');
const publicKey = key.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const pem = key.privateKey.export({ type: 'pkcs8', format: 'pem' });
const usda = join(temporary, 'usda.jsonl'), off = join(temporary, 'off.jsonl');
await writeFile(usda, JSON.stringify(JSON.parse(await readFile('tests/fixtures/al-fresco-usda.json', 'utf8'))));
await writeFile(off, JSON.stringify(JSON.parse(await readFile('tests/fixtures/al-fresco-off.json', 'utf8'))));
const manifests = [];
for (const buckets of [1, 2]) manifests.push(await buildFoodPacks({ usda, off, output: join(temporary, `packs-${buckets}`), baseUrl: 'https://fixture.test/packs/', buckets }));
await build({ entryPoints: ['tests/e2e/pack-harness-worker.ts'], outfile: join(temporary, 'worker.js'), bundle: true, platform: 'browser', format: 'esm', target: 'es2022' });
let generation = 0, failed = false, delay = 0;
const html = `<!doctype html><title>Pack storage test harness</title><script type="module">
 const worker = new Worker('/offline/pack-harness-worker.js', {type:'module'}); let id=0;
 window.addEventListener('pagehide', event => { if (!event.persisted) worker.terminate(); });
 const pending=new Map(); window.ready=new Promise(resolve => {
 worker.onmessage=({data}) => {if(data.ready){resolve();return;} const p=pending.get(data.id);pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.result);};
 worker.onerror=e=>{window.workerError=e.message;}; });
 window.call=async(method,value)=>{await window.ready;return new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});worker.postMessage({id,method,value});});};
 </script>`;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:5199');
    if (url.pathname === '/native-report' && request.method === 'POST') {
      let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 10000) throw new Error('Report too large'); }
      console.log('NATIVE PACK RESULT', body); response.end('ok'); return;
    }
    if (url.pathname !== '/no-isolation') { response.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp'); }
    if (url.pathname === '/control') {
      generation = Number(url.searchParams.get('generation') ?? 0); failed = url.searchParams.get('fail') === 'true'; delay = Number(url.searchParams.get('delay') ?? 0);
      response.end('ok'); return;
    }
    if (url.pathname === '/api/catalog/packs/manifest') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(signPackSet(manifests[generation], pem, publicKey))); return; }
    if (url.pathname === '/fixture.json') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ publicKey })); return; }
    if (url.pathname === '/native-interrupt') {
      const pack = manifests[generation].packs[0];
      const bytes = await readFile(join(temporary, `packs-${pack.buckets}`, new URL(pack.url).pathname.split('/').at(-1)));
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' }); response.write(bytes.subarray(0, 4096));
      return; // Deliberately never EOF: the isolated simulator terminates mid-transfer.
    }
    if (url.pathname === '/api/catalog/packs/download') {
      const pack = manifests[generation].packs.find(pack => pack.id === url.searchParams.get('id') && pack.sha256 === url.searchParams.get('sha256'));
      if (!pack) { response.writeHead(409); response.end(); return; }
      if (failed && pack.source === 'off') { response.writeHead(503); response.end(); return; }
      const bytes = await readFile(join(temporary, `packs-${pack.buckets}`, new URL(pack.url).pathname.split('/').at(-1)));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay)); response.end(bytes); return;
    }
    const paths = { '/offline/pack-harness-worker.js': join(temporary, 'worker.js'), '/offline/sqlite3.wasm': wasm,
      '/offline/sqlite3-opfs-async-proxy.js': join(dirname(wasm), 'sqlite3-opfs-async-proxy.js') };
    if (paths[url.pathname]) { response.setHeader('Content-Type', url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'); response.end(await readFile(paths[url.pathname])); return; }
    response.setHeader('Content-Type', 'text/html'); response.end(html);
  } catch (error) { response.writeHead(500); response.end(error.message); }
});
server.listen(5199, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(async () => { await rm(temporary, { recursive: true, force: true }); process.exit(); }));
