// Disposable Worker and database for authenticated browser tests; no real account or diary.
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'nourish-browser-'));
const state = join(directory, 'data');
const envFile = join(directory, '.env.test');
const args = ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js'];
await writeFile(envFile, [
  'AUTH0_DOMAIN=browser-test.invalid', 'AUTH0_CLIENT_ID=browser-test', 'AUTH0_CLIENT_SECRET=browser-test-secret',
  `AUTH0_SECRET=${'0123456789abcdef'.repeat(4)}`, 'APP_BASE_URL=http://127.0.0.1:5198',
  'AUTH0_AUDIENCE=', 'AUTH0_MOBILE_CLIENT_ID=',
].join('\n'), { mode: 0o600 });
try {
  for (const file of (await readdir('drizzle')).filter(name => name.endsWith('.sql')).sort()) {
    const result = spawnSync(process.execPath, [...args, 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', state, '--file', `drizzle/${file}`], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }
  const server = spawn(process.execPath, [...args, 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', state, '--env-file', envFile, '--ip', '127.0.0.1', '--port', '5198', '--inspector-port', '0'], { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill('SIGTERM'));
  await new Promise(resolve => server.once('exit', resolve));
} finally { await rm(directory, { recursive: true, force: true }); }
