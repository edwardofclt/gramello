import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
import { publishFoodPacks, publishPackAssets, verifyExistingPackAsset } from '../scripts/publish-food-packs.mjs';
const bytes = new Uint8Array(4096), sha256 = createHash('sha256').update(bytes).digest('hex');
const pack = { id: 'off-1-0', bytes: bytes.length, sha256, url: `https://example.org/off-1-0-${sha256}.sqlite` };
const name = `off-1-0-${sha256}.sqlite`;
describe('immutable pack publication', () => {
  it('publishes with more than one MiB of retained historical asset metadata', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gramello-publish-history-'));
    const manifest = { packs: [pack] }, uploads: string[] = [];
    const history = Array.from({ length: 2048 }, (_, id) => ({ id: id + 1, name: `old-${id}.sqlite`, label: 'x'.repeat(900), size: 4096 }));
    const assets = [...history, { id: 2049, name, size: 4096, digest: `sha256:${sha256}` }];
    const release = { id: 17, assets };
    expect(Buffer.byteLength(JSON.stringify(release))).toBeGreaterThan(1024 * 1024);
    const provenance = ['PACK-SOURCES.md', 'PACK-PROVENANCE.json', 'import-report.json', 'extract-food-packs.py', 'food-packs.mjs', 'food-catalog.mjs', 'verify-food-packs.mjs', 'verification-report.json', 'food-packs-requirements.txt', 'catalog-import.ts'];
    writeFileSync(join(root, name), bytes); writeFileSync(join(root, 'pack-set.json'), JSON.stringify(manifest));
    writeFileSync(join(root, 'pack-manifest.json'), JSON.stringify({ payload: JSON.stringify(manifest) }));
    for (const file of provenance) writeFileSync(join(root, file), 'fixture');
    vi.mocked(execFileSync).mockImplementation((binary: any, args: any, options: any) => {
      expect(binary).toBe('gh'); let output = '';
      if (args[0] === 'release') { uploads.push(args[3].split('/').at(-1)); return ''; }
      if (args[1].endsWith('/tags/food-catalog')) output = args.includes('--jq') ? '17' : JSON.stringify(release);
      else {
        const url = new URL('https://api.github.test/' + args[1]), page = Number(url.searchParams.get('page') ?? 0);
        output = JSON.stringify(page ? assets.slice((page - 1) * 100, page * 100) : [assets]);
      }
      if (Buffer.byteLength(output) > options.maxBuffer) throw Object.assign(new Error('ENOBUFS'), { code: 'ENOBUFS' });
      return output;
    });
    try { await publishFoodPacks(root, 'fixture/repo'); expect(uploads).toEqual([...provenance, 'pack-manifest.json']); }
    finally { rmSync(root, { recursive: true, force: true }); vi.mocked(execFileSync).mockReset(); }
  });
  it('aborts all uploads when an existing immutable name has different contents', async () => {
    const uploads: string[] = [];
    await expect(publishPackAssets([pack], [{ name, size: 4096, digest: 'sha256:' + 'a'.repeat(64) }], async () => bytes, async (name: string) => { uploads.push(name); }, ['PACK-SOURCES.md'])).rejects.toThrow('mismatch');
    expect(uploads).toEqual([]);
  });
  it('hashes the exact downloaded asset when no usable SHA-256 digest exists', async () => {
    let reads = 0;
    await verifyExistingPackAsset(pack, { name, size: 4096, digest: 'md5:abc' }, async () => { reads++; return bytes; });
    expect(reads).toBe(1);
    await expect(verifyExistingPackAsset(pack, { name, size: 4096 }, async () => new Uint8Array(4096).fill(1))).rejects.toThrow('mismatch');
  });
  it('checks metadata and downloaded byte sizes', async () => {
    await expect(verifyExistingPackAsset(pack, { name, size: 4097 }, async () => bytes)).rejects.toThrow('size');
    await expect(verifyExistingPackAsset(pack, { name, size: 4096 }, async () => new Uint8Array(1))).rejects.toThrow('size');
  });
  it('skips matching assets and advertises the manifest last', async () => {
    const next = { ...pack, id: 'usda-branded-1-0', url: `https://example.org/usda-branded-1-0-${sha256}.sqlite` };
    const uploads: [string, boolean][] = [];
    await publishPackAssets([pack, next], [{ name, size: 4096, digest: `sha256:${sha256}` }], async () => { throw new Error('unexpected read'); }, async (name: string, clobber: boolean) => { uploads.push([name, clobber]); }, ['PACK-SOURCES.md']);
    expect(uploads).toEqual([[`usda-branded-1-0-${sha256}.sqlite`, false], ['PACK-SOURCES.md', true], ['pack-manifest.json', true]]);
  });
  it.each(['pack', 'provenance'])('does not advertise after a failed %s upload', async kind => {
    const uploads: string[] = [];
    await expect(publishPackAssets([pack], [], async () => bytes, async (file: string) => {
      uploads.push(file); if (file === (kind === 'pack' ? name : 'PACK-SOURCES.md')) throw new Error('network');
    }, ['PACK-SOURCES.md'])).rejects.toThrow('network');
    expect(uploads).not.toContain('pack-manifest.json');
  });
  it('rejects an unsafe or non-content-addressed local filename before uploads', async () => {
    await expect(publishPackAssets([{ ...pack, url: 'https://example.org/../../wrong.sqlite' }], [], async () => bytes, async () => {})).rejects.toThrow('filename');
  });
});
