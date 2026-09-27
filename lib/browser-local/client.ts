import { createLocalApi } from '../../mobile/src/local/api';
import { archiveCsv } from '../../mobile/src/local/records';
import type { LocalRepository } from '../../mobile/src/local/repository';
import type { ApiClient } from '../../mobile/src/lib/api';
import type { CatalogUpdater, UpdateStatus } from '../../mobile/src/catalog/updater';
import type { WorkerRequest, WorkerResponse } from './protocol';

export interface BrowserRuntime {
  api: ApiClient;
  repository: LocalRepository;
  updater: CatalogUpdater;
  exportFile(format: 'backup' | 'diary' | 'water'): Promise<void>;
  importFile(text: string): Promise<void>;
  restorePrevious(): Promise<void>;
  needsHostedMigration(): Promise<boolean>;
  migrateHosted(text: string): Promise<boolean>;
  subscribe(listener: () => void): () => void;
  getStatus(): { phase: 'ready' | 'error'; error?: string };
}

async function openRuntime(): Promise<BrowserRuntime> {
  if (!globalThis.Worker || !globalThis.indexedDB || !navigator.locks) {
    throw new Error('This browser cannot safely store your diary offline. Use a current browser with site storage enabled.');
  }
  const worker = new Worker('/offline/diary-worker.js', { type: 'module' });
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; cleanup: () => void }>();
  let nextId = 0;
  let fatal: Error | undefined;
  let updateStatus: UpdateStatus = { phase: 'idle' };
  const updateListeners = new Set<() => void>();
  const listeners = new Set<() => void>();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('gramello-local-changes') : undefined;
  const notify = () => { for (const listener of listeners) listener(); };
  if (channel) channel.onmessage = notify;
  function fail(error: Error) {
    fatal = error;
    for (const request of pending.values()) { request.cleanup(); request.reject(error); }
    pending.clear();
    worker.terminate();
  }
  worker.onerror = () => fail(new Error('The offline diary could not be opened. Reload Gramello while online and try again.'));
  worker.onmessageerror = () => fail(new Error('The offline diary connection was interrupted. Reload Gramello and try again.'));
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if ('event' in message) {
      if (message.event === 'catalog') { updateStatus = message.status; for (const listener of updateListeners) listener(); }
      else { notify(); channel?.postMessage('changed'); }
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); request.cleanup();
    if (message.error) request.reject(new Error(message.error)); else request.resolve(message.value);
  };
  function rpc<T>(method: string, args: unknown[] = [], signal?: AbortSignal): Promise<T> {
    if (fatal) return Promise.reject(fatal);
    if (signal?.aborted) return Promise.reject(new DOMException('Operation cancelled.', 'AbortError'));
    return new Promise<T>((resolve, reject) => {
      const id = ++nextId;
      const abort = () => {
        pending.delete(id); signal?.removeEventListener('abort', abort);
        worker.postMessage({ cancel: id } satisfies WorkerRequest);
        reject(new DOMException('Operation cancelled.', 'AbortError'));
      };
      pending.set(id, { resolve: value => resolve(value as T), reject, cleanup: () => signal?.removeEventListener('abort', abort) });
      signal?.addEventListener('abort', abort, { once: true });
      try { worker.postMessage({ id, method, args } satisfies WorkerRequest); }
      catch (error) { pending.delete(id); signal?.removeEventListener('abort', abort); reject(error); }
    });
  }
  try { await rpc('init'); }
  catch (error) { worker.terminate(); channel?.close(); throw error; }
  // Explicit methods preserve native argument types and prevent accidental
  // Promise/then probing from becoming worker messages.
  const repository: LocalRepository = {
    getDay: date => rpc('getDay', [date]),
    saveGoals: input => rpc('saveGoals', [input]),
    addEntry: input => rpc('addEntry', [input]),
    updateEntry: (id, input) => rpc('updateEntry', [id, input]),
    removeEntry: id => rpc('removeEntry', [id]),
    getTrends: (days, today) => rpc('getTrends', [days, today]),
    searchFoods: (query, options) => {
      const { signal, ...searchOptions } = options ?? {};
      return rpc('searchFoods', [query, searchOptions], signal);
    },
    lookupBarcode: (code, signal) => rpc('lookupBarcode', [code], signal),
    createFood: input => rpc('createFood', [input]),
    listMeals: () => rpc('listMeals'),
    saveMeal: (input, id) => rpc('saveMeal', [input, id]),
    deleteMeal: id => rpc('deleteMeal', [id]),
    getWaterDay: date => rpc('getWaterDay', [date]),
    addWater: input => rpc('addWater', [input]),
    removeWater: id => rpc('removeWater', [id]),
    saveWaterGoal: input => rpc('saveWaterGoal', [input]),
    exportArchive: () => rpc('exportArchive'),
    importArchive: text => rpc('importArchive', [text]),
    hasRecovery: () => rpc('hasRecovery'),
    restorePrevious: () => rpc('restorePrevious'),
  };
  const status = { phase: 'ready' as const };
  return {
    api: createLocalApi(repository), repository,
    updater: {
      getStatus: () => updateStatus,
      subscribe(listener) { updateListeners.add(listener); return () => { updateListeners.delete(listener); }; },
      async check(force = false) {
        try { await rpc('catalog.check', [force]); }
        catch (error) {
          updateStatus = { ...updateStatus, phase: 'error', error: error instanceof Error ? error.message : 'Catalog updates are unavailable.' };
          for (const listener of updateListeners) listener();
        }
      },
    },
    async exportFile(format) {
      const archive = await repository.exportArchive();
      const text = format === 'backup' ? JSON.stringify(archive) : archiveCsv(archive)[format];
      const url = URL.createObjectURL(new Blob([text], { type: format === 'backup' ? 'application/json' : 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `gramello-${format}-${new Date().toISOString().replace(/[:.]/g, '-')}.${format === 'backup' ? 'gramello' : 'csv'}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    importFile: text => repository.importArchive(text),
    restorePrevious: () => repository.restorePrevious(),
    needsHostedMigration: () => rpc('needsHostedMigration'),
    migrateHosted: text => rpc('migrateHosted', [text]),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getStatus: () => fatal ? { phase: 'error', error: fatal.message } : status,
  };
}

let runtime: Promise<BrowserRuntime> | undefined;
export function getBrowserRuntime(): Promise<BrowserRuntime> {
  runtime ??= openRuntime().catch(error => { runtime = undefined; throw error; });
  return runtime;
}
