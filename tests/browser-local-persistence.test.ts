import { describe, expect, it } from 'vitest';
import { withSnapshot, type SnapshotStore } from '../lib/browser-local/persistence';

function harness(initial = 0) {
  const saved = new Map<string, unknown>([['personal', new Uint8Array([initial])]]);
  let rejectCommit = false, closes = 0, queue: Promise<unknown> = Promise.resolve();
  const store: SnapshotStore = {
    async read<T>(key: string) { return structuredClone(saved.get(key)) as T | undefined; },
    async commit(values) {
      if (rejectCommit) throw new Error('Quota exceeded');
      for (const [key, value] of values) saved.set(key, structuredClone(value));
    },
  };
  function lock<T>(_name: string, work: () => Promise<T>): Promise<T> {
    const result = queue.then(work); queue = result.catch(() => {}); return result;
  }
  const open = (bytes?: Uint8Array) => ({ value: bytes?.[0] ?? 0, export() { return new Uint8Array([this.value]); }, close() { closes++; } });
  const operation = <T>(write: boolean, work: (db: ReturnType<typeof open>, extra: Array<readonly [string, unknown]>) => Promise<T>) => withSnapshot({ key: 'personal', store, lock, open, write, work });
  return { saved, operation, failCommit() { rejectCommit = true; }, allowCommit() { rejectCommit = false; }, closes: () => closes };
}

describe('durable browser diary operations', () => {
  it('reopens the newest committed snapshot for each competing tab operation', async () => {
    const state = harness(5);
    await Promise.all(Array.from({ length: 12 }, () => state.operation(true, async db => {
      const before = db.value; await Promise.resolve(); db.value = before + 1;
    })));
    expect(await state.operation(false, async db => db.value)).toBe(17);
    expect(state.closes()).toBe(13);
  });

  it('does not expose in-memory changes after storage commit fails', async () => {
    const state = harness(7); state.failCommit();
    await expect(state.operation(true, async db => { db.value = 99; return 'saved'; })).rejects.toThrow('Quota exceeded');
    state.allowCommit();
    expect(await state.operation(false, async db => db.value)).toBe(7);
    expect(state.closes()).toBe(2);
  });

  it('discards a failed operation before any persistence or migration marker', async () => {
    const state = harness(7);
    await expect(state.operation(true, async (db, extra) => {
      db.value = 99; extra.push(['hosted:migrated', true]); throw new Error('Invalid archive');
    })).rejects.toThrow('Invalid archive');
    expect(await state.operation(false, async db => db.value)).toBe(7);
    expect(state.saved.has('hosted:migrated')).toBe(false);
  });

  it('commits the hosted migration marker together with the new diary snapshot', async () => {
    const state = harness();
    state.failCommit();
    const migrate = () => state.operation(false, async (db, extra) => { db.value = 42; extra.push(['hosted:migrated', true]); });
    await expect(migrate()).rejects.toThrow('Quota exceeded');
    expect(state.saved.has('hosted:migrated')).toBe(false);
    state.allowCommit(); await migrate();
    expect(state.saved.get('hosted:migrated')).toBe(true);
    expect(await state.operation(false, async db => db.value)).toBe(42);
  });
});
