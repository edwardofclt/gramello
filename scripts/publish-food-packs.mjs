import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifyExistingPackAsset(pack, asset, readAsset) {
  if (asset.size !== pack.bytes) throw new Error(`Asset size mismatch: ${asset.name}`);
  const digest = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest ?? '');
  let actual;
  if (digest) actual = digest[1].toLowerCase();
  else {
    const bytes = await readAsset();
    if (bytes.length !== pack.bytes) throw new Error(`Asset size mismatch: ${asset.name}`);
    actual = hash(bytes);
  }
  if (actual !== pack.sha256) throw new Error(`Immutable asset hash mismatch: ${asset.name}`);
}
function packFilename(pack) {
  if (!/^(off|usda-branded)-\d{1,3}-\d{1,3}$/.test(pack.id) || !/^[a-f0-9]{64}$/.test(pack.sha256)
    || !Number.isInteger(pack.bytes) || pack.bytes < 4096 || pack.bytes > 32 * 1024 * 1024) throw new Error('Invalid pack descriptor.');
  const name = `${pack.id}-${pack.sha256}.sqlite`;
  if (new URL(pack.url).pathname.split('/').at(-1) !== name) throw new Error('Invalid content-addressed pack filename.');
  return name;
}
// All immutable assets are preflighted before *any* upload; the manifest is last.
export async function publishPackAssets(packs, assets, readAsset, upload, provenance = []) {
  const names = packs.map(packFilename);
  if (new Set(names).size !== names.length) throw new Error('Duplicate immutable pack assets.');
  for (let i = 0; i < packs.length; i++) {
    const asset = assets.find(asset => asset.name === names[i]);
    if (asset) await verifyExistingPackAsset(packs[i], asset, () => readAsset(asset));
  }
  for (const name of names) if (!assets.some(asset => asset.name === name)) await upload(name, false);
  for (const name of provenance) await upload(name, true);
  await upload('pack-manifest.json', true);
}

export async function publishFoodPacks(directory, repository, tag = 'food-catalog') {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || tag !== 'food-catalog') throw new Error('Invalid release target.');
  const manifest = JSON.parse(readFileSync(join(directory, 'pack-set.json'), 'utf8'));
  const signed = JSON.parse(readFileSync(join(directory, 'pack-manifest.json'), 'utf8'));
  if (JSON.stringify(JSON.parse(signed.payload)) !== JSON.stringify(manifest)) throw new Error('Signed manifest differs from built pack set.');
  const provenance = ['PACK-SOURCES.md', 'PACK-PROVENANCE.json', 'import-report.json', 'extract-food-packs.py', 'food-packs.mjs',
    'food-catalog.mjs', 'verify-food-packs.mjs', 'verification-report.json', 'food-packs-requirements.txt', 'catalog-import.ts'];
  // Verify every local path before starting remote mutation.
  for (const pack of manifest.packs) {
    const name = packFilename(pack), bytes = readFileSync(join(directory, name));
    await verifyExistingPackAsset(pack, { name, size: bytes.length }, async () => bytes);
  }
  for (const name of provenance) readFileSync(join(directory, name));
  const gh = args => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  // The release response itself embeds all assets. Filter inside gh before its
  // stdout is captured, then page assets instead of buffering release history.
  const releaseId = JSON.parse(gh(['api', `repos/${repository}/releases/tags/${tag}`, '--jq', '.id']));
  if (!Number.isSafeInteger(releaseId) || releaseId <= 0) throw new Error('Invalid release identity.');
  const wanted = new Set(manifest.packs.map(packFilename)), assets = [];
  for (let page = 1; ; page++) {
    const batch = JSON.parse(gh(['api', `repos/${repository}/releases/${releaseId}/assets?per_page=100&page=${page}`]));
    if (!Array.isArray(batch) || batch.length > 100) throw new Error('Invalid release asset page.');
    for (const asset of batch) if (wanted.delete(asset.name)) assets.push(asset);
    if (batch.length < 100 || !wanted.size) break;
  }
  const temporary = mkdtempSync(join(tmpdir(), 'gramello-publish-preflight-'));
  try {
    await publishPackAssets(manifest.packs, assets, async asset => {
      if (!Number.isSafeInteger(asset.id) || asset.id <= 0) throw new Error('Invalid release asset identity.');
      const bytes = execFileSync('gh', ['api', `repos/${repository}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream'],
        { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 });
      const path = join(temporary, asset.name); writeFileSync(path, bytes); return readFileSync(path);
    }, async (name, clobber) => {
      gh(['release', 'upload', tag, join(directory, name), '--repo', repository, ...(clobber ? ['--clobber'] : [])]);
    }, provenance);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await publishFoodPacks(process.argv[2], process.env.GH_REPO);
}
