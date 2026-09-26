import type { UpdateStatus } from '../../mobile/src/catalog/updater';
export type WorkerRequest = { id: number; method: string; args: unknown[] } | { cancel: number };
export type WorkerResponse = { id: number; value?: unknown; error?: string } | { event: 'catalog'; status: UpdateStatus } | { event: 'change' };
