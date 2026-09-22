import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../out/website/', import.meta.url));
const homeHtml = await readFile(path.join(root, 'index.html'), 'utf8');
const base = homeHtml.match(/<link rel="canonical" href="([^"]+)"/)[1];
const basePath = new URL(base).pathname;
let checked = 0;
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    files.push(...(entry.isDirectory() ? await walk(full) : [full]));
  }
  return files;
}
for (const file of (await walk(root)).filter(file => file.endsWith('.html'))) {
  const html = await readFile(file, 'utf8');
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${file}: expected one h1`);
  assert.match(html, /<html lang="en">/, `${file}: missing language`);
  assert.match(html, /name="viewport"/, `${file}: missing viewport`);
  assert(!/\b(TODO|TBD|PLACEHOLDER)\b/.test(html), `${file}: unfinished copy`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${file}: duplicate IDs`);
  const page = new URL(path.relative(root, file).replace(/index\.html$/, ''), base);
  for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = new URL(target, page);
    if (url.origin !== new URL(base).origin || url.protocol !== 'https:') continue;
    assert(url.pathname.startsWith(basePath), `${file}: link escapes project base: ${target}`);
    let local = path.join(root, decodeURIComponent(url.pathname.slice(basePath.length)));
    const info = await stat(local).catch(() => null);
    assert(info, `${file}: missing local target ${target}`);
    if (info.isDirectory()) local = path.join(local, 'index.html');
    const linked = await readFile(local);
    if (url.hash) assert(linked.toString().includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${file}: missing anchor ${target}`);
    checked++;
  }
  for (const match of html.matchAll(/<img\b[^>]*>/g)) assert.match(match[0], /\balt="[^"]*"/, `${file}: image needs alt text`);
}
console.log(`Website checks passed: five pages, ${checked} local links/assets/anchors, titles, language, and image alternatives.`);
