import { verifyManifest, type CatalogManifest } from './format';
export type UpdateState = { version?: string; lastCheck?: number; nextCheck?: number; failures?: number };
export type UpdateStatus = UpdateState & { phase: 'idle' | 'checking' | 'downloading' | 'current' | 'updated' | 'error'; error?: string };
export interface UpdateStorage {
  load(): Promise<UpdateState>;
  save(state: UpdateState): Promise<void>;
  fetchManifest(): Promise<unknown>;
  // Must hash/inspect the staged database and activate it atomically.
  install(manifest: CatalogManifest): Promise<void>;
}
export function createCatalogUpdater(storage: UpdateStorage, publicKey: string, now = Date.now, random = Math.random) {
  let status: UpdateStatus = { phase: 'idle' }, pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const update = (value: UpdateStatus) => { status = value; for (const listener of listeners) listener(); };
  async function perform(force: boolean) {
    let state: UpdateState = {};
    try {
      state = await storage.load();
      if (!force && Number.isFinite(state.nextCheck) && now() < state.nextCheck!) { update({ ...state, phase: 'idle' }); return; }
      update({ ...state, phase: 'checking' });
      const manifest = verifyManifest(await storage.fetchManifest(), publicKey);
      const changed = manifest.version !== state.version;
      if (changed) { update({ ...state, phase: 'downloading' }); await storage.install(manifest); }
      state = { version: manifest.version, lastCheck: now(), nextCheck: now() + 86400000 + Math.floor(random() * 3600000), failures: 0 };
      await storage.save(state);
      update({ ...state, phase: changed ? 'updated' : 'current' });
    } catch (error) {
      const failures = Math.min((state.failures ?? 0) + 1, 10);
      const retry = { ...state, failures, nextCheck: now() + Math.min(3600000 * 2 ** (failures - 1), 86400000) };
      try { await storage.save(retry); } catch { /* Local data remains usable even if metadata cannot be saved. */ }
      update({ ...retry, phase: 'error', error: error instanceof Error ? error.message : 'Catalog update could not complete.' });
    }
  }
  return {
    getStatus: () => status,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    check(force = false): Promise<void> {
      if (!pending) pending = perform(force).finally(() => { pending = null; });
      return pending;
    },
  };
}
export type CatalogUpdater = ReturnType<typeof createCatalogUpdater>;
