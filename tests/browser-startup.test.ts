import { describe, expect, it, vi } from 'vitest';
import { localDiaryFetch, migratePreviousDiary } from '../lib/browser-startup';

describe('local browser diary startup', () => {
  const archive = { format: 'gramello', version: 1, exportedAt: '2026-09-26T12:00:00Z', records: [] };
  it('uses native operations without making an HTTP diary write', async () => {
    const api = vi.fn().mockResolvedValue({ id: 'local-entry' });
    const result = await localDiaryFetch(api)('/api/water', { method: 'POST', body: JSON.stringify({ date: '2026-09-26', amountMl: 250 }) });
    expect(await result.json()).toEqual({ id: 'local-entry' });
    expect(api).toHaveBeenCalledWith('/api/water', { method: 'POST', body: { date: '2026-09-26', amountMl: 250 }, signal: undefined });
  });
  it('surfaces failed durable writes and never retries them', async () => {
    const api = vi.fn().mockRejectedValue(new Error('Browser storage is full.'));
    const result = await localDiaryFetch(api)('/api/goals', { method: 'PUT', body: '{}' });
    expect(result.ok).toBe(false);
    expect(await result.json()).toEqual({ error: 'Browser storage is full.' });
    expect(api).toHaveBeenCalledTimes(1);
  });
  it('never sends requests to external destinations or cancelled operations', async () => {
    const api = vi.fn();
    const client = localDiaryFetch(api);
    await expect(client('https://example.com/api/day')).rejects.toThrow('Invalid');
    await expect(client('/api/day', { signal: AbortSignal.abort() })).rejects.toThrow('Aborted');
    expect(api).not.toHaveBeenCalled();
  });
  it('boots existing local diaries without any hosted network access', async () => {
    const runtime = { needsHostedMigration: vi.fn().mockResolvedValue(false), migrateHosted: vi.fn() };
    const fetcher = vi.fn();
    await migratePreviousDiary(runtime, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(runtime.migrateHosted).not.toHaveBeenCalled();
  });
  it('passes a validated complete archive to atomic migration', async () => {
    const runtime = { needsHostedMigration: vi.fn().mockResolvedValue(true), migrateHosted: vi.fn().mockResolvedValue(true) };
    await migratePreviousDiary(runtime, vi.fn().mockResolvedValue(Response.json(archive)));
    expect(runtime.migrateHosted).toHaveBeenCalledWith(JSON.stringify(archive));
  });
  it('leaves migration pending if the server fails or returns an invalid backup', async () => {
    const runtime = { needsHostedMigration: vi.fn().mockResolvedValue(true), migrateHosted: vi.fn() };
    await expect(migratePreviousDiary(runtime, vi.fn().mockResolvedValue(Response.json({}, { status: 503 })))).rejects.toThrow('previous web diary');
    await expect(migratePreviousDiary(runtime, vi.fn().mockResolvedValue(Response.json({ records: [] })))).rejects.toThrow('invalid');
    expect(runtime.migrateHosted).not.toHaveBeenCalled();
  });
});
