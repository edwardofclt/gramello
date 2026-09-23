// Disposable Worker and database for browser diary tests; no real data.
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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
  const server = spawn(process.execPath, [...args, 'dev', '--config', 'dist/server/wrangler.json', '--local', '--persist-to', state, '--env-file', envFile, '--ip', '127.0.0.1', '--port', '5198', '--inspector-port', '0'], { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill('SIGTERM'));
  await new Promise(resolve => server.once('exit', resolve));
} finally { await rm(directory, { recursive: true, force: true }); }
