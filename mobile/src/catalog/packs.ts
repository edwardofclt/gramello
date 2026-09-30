import { z } from 'zod';
import nacl from 'tweetnacl';
import { hexBytes } from './format';
import type { UpdateState, UpdateStatus, CatalogUpdater } from './updater';
import type { SqliteConnection } from '../local/database';
import { inspectCatalog } from './queries';

const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);
export const packSchema = z.object({
  schemaVersion: z.literal(1), id: version, version,
  source: z.enum(['usda-branded', 'off']), market: z.literal('US'), license: z.enum(['CC0-1.0', 'ODbL-1.0']),
  url: z.string().url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().min(4096).max(32 * 1024 * 1024),
  count: z.number().int().min(1).max(100000), bucket: z.number().int().min(0).max(255), buckets: z.number().int().min(1).max(256),
}).refine(pack => pack.bucket < pack.buckets && pack.id === `${pack.source}-${pack.buckets}-${pack.bucket}`
  && pack.license === (pack.source === 'off' ? 'ODbL-1.0' : 'CC0-1.0'));
export type FoodPack = z.infer<typeof packSchema>;
const packSetSchema = z.object({ schemaVersion: z.literal(2), version, publishedAt: z.string().datetime(), packs: z.array(packSchema).min(1).max(512) })
  .refine(set => new Set(set.packs.map(pack => pack.id)).size === set.packs.length)
  .refine(set => set.packs.reduce((sum, pack) => sum + pack.bytes, 0) <= 4 * 1024 ** 3)
  .refine(set => ['off', 'usda-branded'].every(source => new Set(set.packs.filter(pack => pack.source === source).map(pack => pack.buckets)).size <= 1));
export function verifyPackManifest(value: unknown, publicKey: string) {
  const envelope = z.object({ payload: z.string().max(512000), signature: z.string() }).parse(value);
  if (!nacl.sign.detached.verify(new TextEncoder().encode(envelope.payload), hexBytes(envelope.signature, 64), hexBytes(publicKey, 32))) throw new Error('The expansion catalog signature could not be verified.');
  return packSetSchema.parse(JSON.parse(envelope.payload));
}
export async function inspectFoodPack(db: SqliteConnection, pack: FoodPack) {
  await inspectCatalog(db, pack);
  const source = await db.getFirstAsync<{ value: string }>("SELECT value FROM catalog_meta WHERE key='pack_source'");
  const market = await db.getFirstAsync<{ value: string }>("SELECT value FROM catalog_meta WHERE key='market'");
  const license = await db.getFirstAsync<{ value: string }>("SELECT value FROM catalog_meta WHERE key='license'");
  if (source?.value !== pack.source || market?.value !== 'US' || license?.value !== pack.license) throw new Error('The downloaded pack has incorrect source or license metadata.');
}
export interface PackStorage {
  exclusive?<T>(work: () => Promise<T>): Promise<T>;
  load(): Promise<UpdateState>;
  save(state: UpdateState): Promise<void>;
  list(): Promise<FoodPack[]>;
  available?(pack: FoodPack): Promise<boolean>;
  fetchManifest(): Promise<unknown>;
  // Durably commit descriptor + verified database together before returning.
  install(pack: FoodPack, onProgress?: (receivedBytes: number) => void): Promise<void>;
  retire(wanted: FoodPack[]): Promise<void>;
}
export function createPackUpdater(storage: PackStorage, publicKey: string, now = Date.now, random = Math.random): CatalogUpdater {
  let status: UpdateStatus = { phase: 'idle' }, pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const update = (next: UpdateStatus) => { status = next; for (const listener of listeners) listener(); };
  async function perform(force: boolean) {
    let state: UpdateState = {}, progress = {};
    try {
      state = await storage.load();
      if (!force && state.nextCheck && now() < state.nextCheck) { update({ ...state, phase: 'idle' }); return; }
      update({ ...state, phase: 'checking' });
      const manifest = verifyPackManifest(await storage.fetchManifest(), publicKey);
      const installed = await storage.list(), errors: string[] = [];
      let completedPacks = 0, downloadedBytes = 0, changed = false;
      const totalPacks = manifest.packs.length, totalBytes = manifest.packs.reduce((sum, pack) => sum + pack.bytes, 0);
      const packs = [...manifest.packs].sort((a, b) => Number(a.source === 'off') - Number(b.source === 'off') || a.bucket - b.bucket);
      let nextPack = 0;
      const received = new Map<string, number>();
      const reportProgress = () => {
        progress = { completedPacks, totalPacks, downloadedBytes, totalBytes };
        update({ ...state, ...progress, phase: 'downloading' });
      };
      reportProgress();
      // Each worker claims a pack before awaiting, keeping at most three installs in flight.
      async function worker() {
        while (nextPack < packs.length) {
          const pack = packs[nextPack++];
          try {
            if (!installed.some(old => old.id === pack.id && old.sha256 === pack.sha256 && old.version === pack.version)
              || (storage.available && !await storage.available(pack))) {
              await storage.install(pack, bytes => {
                if (!Number.isFinite(bytes)) return;
                const before = received.get(pack.id) ?? 0;
                const next = Math.max(before, Math.min(pack.bytes, Math.max(0, bytes)));
                received.set(pack.id, next); downloadedBytes += next - before;
                reportProgress();
              }); changed = true;
            }
            completedPacks++; downloadedBytes += pack.bytes - (received.get(pack.id) ?? 0); received.set(pack.id, pack.bytes);
          } catch (error) { errors.push(`${pack.source === 'off' ? 'Open Food Facts' : 'USDA'}: ${error instanceof Error ? error.message : 'Download failed.'}`); }
          reportProgress();
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, packs.length) }, () => worker()));
      progress = { completedPacks, totalPacks, downloadedBytes, totalBytes };
      if (errors.length) throw new Error(errors.slice(0, 2).join(' '));
      await storage.retire(manifest.packs);
      state = { version: manifest.version, failures: 0, lastCheck: now(), nextCheck: now() + 86400000 + Math.floor(random() * 3600000) };
      await storage.save(state);
      update({ ...state, ...progress, phase: changed ? 'updated' : 'current' });
    } catch (error) {
      const failures = Math.min((state.failures ?? 0) + 1, 10);
      const retry = { ...state, failures, nextCheck: now() + Math.min(3600000 * 2 ** (failures - 1), 86400000) };
      try { await storage.save(retry); } catch { /* Verified installed packs remain usable. */ }
      update({ ...retry, ...progress, phase: 'error', error: error instanceof Error ? error.message : 'Expansion downloads could not complete.' });
    }
  }
  return {
    getStatus: () => status,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    check(force = false) { pending ??= (storage.exclusive ? storage.exclusive(() => perform(force)) : perform(force)).finally(() => { pending = undefined; }); return pending; },
  };
}
