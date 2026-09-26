// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserDataSettings } from '../components/browser-data-settings';
import { MAX_ARCHIVE_BYTES, parseArchive } from '../mobile/src/local/records';
import { defaultWaterGoal } from '../lib/water';
import type { UpdateStatus } from '../mobile/src/catalog/updater';

const archive = {
  format: 'gramello', version: 1, exportedAt: '2026-09-25T12:00:00.000Z', records: [
    { kind: 'water', id: 'water-1', date: '2024-02-29', value: { id: 'water-1', date: '2024-02-29', amountMl: 236.5882365, createdAt: '2024-02-29T12:00:00.000Z' } },
    { kind: 'goals', id: 'default', date: null, value: { calories: 2100, protein: 120, carbs: 220, fat: 70 } },
  ],
};
const archiveText = JSON.stringify(archive);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

let root: Root;
let container: HTMLDivElement;
function fixture(recovery = false) {
  const status: UpdateStatus = { phase: 'current', version: '2026-09-25.1' };
  const api = vi.fn(async (path: string) => ({
    date: new URL(path, 'https://local.test').searchParams.get('date'), entries: [], totalMl: 0, goal: defaultWaterGoal,
  }));
  const repository = { hasRecovery: vi.fn(async () => recovery) };
  const importFile = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  const restorePrevious = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const exportFile = vi.fn<(kind: 'backup' | 'diary' | 'water') => Promise<void>>().mockResolvedValue(undefined);
  const updater = { getStatus: () => status, subscribe: () => () => {}, check: vi.fn(async () => {}) };
  const runtime = { api, repository, updater, importFile, restorePrevious, exportFile } as unknown as Parameters<typeof BrowserDataSettings>[0]['runtime'];
  const onReplaced = vi.fn();
  return { runtime, api, repository, importFile, restorePrevious, exportFile, onReplaced };
}
async function render(value = fixture()) {
  await act(async () => root.render(createElement(BrowserDataSettings, {
    runtime: value.runtime, offlineStatus: 'Ready offline', onReplaced: value.onReplaced, onGoals: vi.fn(),
  })));
  return value;
}
function button(label: string, parent: Document | HTMLElement = document): HTMLButtonElement {
  const found = [...parent.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function dialog() { return document.querySelector<HTMLElement>('[role="dialog"]'); }
async function click(label: string, parent: Document | HTMLElement = document) { await act(async () => button(label, parent).click()); }
async function upload(text = archiveText, options: { size?: number; read?: () => Promise<string> } = {}) {
  const file = new File([text], 'mobile-backup.gramello', { type: 'application/json' });
  const read = vi.fn(options.read ?? (async () => text));
  Object.defineProperty(file, 'text', { value: read });
  if (options.size !== undefined) Object.defineProperty(file, 'size', { value: options.size });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  return { input, read };
}
async function escape() {
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
}
async function outside() {
  // Radix installs its outside-pointer listener on the following task.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  await act(async () => {
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')!;
    for (const type of ['pointerdown', 'pointerup', 'click']) overlay.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('browser data settings', () => {
  it('validates a mobile backup and previews its record count before any replacement', async () => {
    const value = await render();
    const { read, input } = await upload();
    expect(read).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
    expect(dialog()?.textContent).toContain('2 records');
    expect(button('Replace and import').disabled).toBe(false);
    expect(value.importFile).not.toHaveBeenCalled();
    expect(value.restorePrevious).not.toHaveBeenCalled();
    expect(value.onReplaced).not.toHaveBeenCalled();
  });

  it.each([
    ['unreadable JSON', 'not-json'],
    ['a future backup version', JSON.stringify({ ...archive, version: 2 })],
    ['an inconsistent record identity', JSON.stringify({ ...archive, records: [{ ...archive.records[0], id: 'different-id' }] })],
    ['a duplicated record', JSON.stringify({ ...archive, records: [archive.records[0], archive.records[0]] })],
  ])('rejects %s without opening replacement or writing data', async (_reason, text) => {
    const value = await render();
    await upload(text);
    expect(dialog()).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/not a readable|incomplete, invalid/);
    expect(value.importFile).not.toHaveBeenCalled();
    expect(value.onReplaced).not.toHaveBeenCalled();
    // The same file input can be used again after a failed attempt.
    await upload();
    expect(dialog()).not.toBeNull();
  });

  it('rejects an oversized file before reading it into memory', async () => {
    const value = await render();
    const { read } = await upload(archiveText, { size: MAX_ARCHIVE_BYTES + 1 });
    expect(read).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('32 MB');
    expect(value.importFile).not.toHaveBeenCalled();
  });

  it.each(['Cancel', 'Close', 'Escape', 'outside pointer'])('dismisses an idle preview through %s without changing data', async action => {
    const value = await render();
    await upload();
    if (action === 'Escape') await escape();
    else if (action === 'outside pointer') await outside();
    else await click(action, dialog()!);
    expect(dialog()).toBeNull();
    expect(value.importFile).not.toHaveBeenCalled();
    expect(value.restorePrevious).not.toHaveBeenCalled();
    expect(value.onReplaced).not.toHaveBeenCalled();
  });

  it('waits for explicit replacement, locks duplicate clicks, and prevents dismissal until saving finishes', async () => {
    const value = fixture();
    const write = deferred<void>();
    value.importFile.mockReturnValue(write.promise);
    await render(value);
    await upload();
    const replace = button('Replace and import');
    await act(async () => { replace.click(); replace.click(); });
    expect(value.importFile).toHaveBeenCalledExactlyOnceWith(archiveText);
    expect(parseArchive(value.importFile.mock.calls[0][0])).toEqual(archive);
    expect(button('Saving…').disabled).toBe(true);
    expect(button('Cancel').disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(true);
    expect(value.onReplaced).not.toHaveBeenCalled();
    await escape();
    await click('Close', dialog()!);
    await click('Cancel', dialog()!);
    await outside();
    expect(dialog()).not.toBeNull();
    expect(value.importFile).toHaveBeenCalledTimes(1);
    expect(value.onReplaced).not.toHaveBeenCalled();
    await act(async () => write.resolve());
    expect(dialog()).toBeNull();
    expect(value.onReplaced).toHaveBeenCalledTimes(1);
  });

  it('retains the exact preview and backup after a failed replacement and retries only after confirmation', async () => {
    const value = fixture();
    value.importFile.mockRejectedValueOnce(new Error('Storage is full')).mockResolvedValueOnce(undefined);
    await render(value);
    await upload();
    await click('Replace and import');
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe('Storage is full');
    expect(dialog()?.textContent).toContain('2 records');
    expect(button('Replace and import').disabled).toBe(false);
    expect(value.onReplaced).not.toHaveBeenCalled();
    await click('Replace and import');
    expect(value.importFile.mock.calls).toEqual([[archiveText], [archiveText]]);
    expect(value.onReplaced).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it('requires recovery confirmation and awaits the restoration before notifying the diary', async () => {
    const value = fixture(true);
    const recovery = deferred<void>();
    value.restorePrevious.mockReturnValue(recovery.promise);
    await render(value);
    await click('Recover previous diary');
    expect(value.restorePrevious).not.toHaveBeenCalled();
    await click('Cancel', dialog()!);
    expect(value.restorePrevious).not.toHaveBeenCalled();
    await click('Recover previous diary');
    const confirm = button('Recover diary');
    await act(async () => { confirm.click(); confirm.click(); });
    expect(value.restorePrevious).toHaveBeenCalledTimes(1);
    expect(value.importFile).not.toHaveBeenCalled();
    expect(value.onReplaced).not.toHaveBeenCalled();
    await escape();
    expect(dialog()).not.toBeNull();
    await act(async () => recovery.resolve());
    expect(dialog()).toBeNull();
    expect(value.onReplaced).toHaveBeenCalledTimes(1);
  });

  it('keeps recovery available when restoration fails, allowing a deliberate retry', async () => {
    const value = fixture(true);
    value.restorePrevious.mockRejectedValueOnce(new Error('Recovery could not be saved')).mockResolvedValueOnce(undefined);
    await render(value);
    await click('Recover previous diary');
    await click('Recover diary');
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe('Recovery could not be saved');
    expect(value.onReplaced).not.toHaveBeenCalled();
    await click('Recover diary');
    expect(value.restorePrevious).toHaveBeenCalledTimes(2);
    expect(value.onReplaced).toHaveBeenCalledTimes(1);
  });

  it('selects the native backup format separately from diary and water CSV exports', async () => {
    const value = await render();
    await click('Export backup');
    await click('Export diary CSV');
    await click('Export water CSV');
    expect(value.exportFile.mock.calls).toEqual([['backup'], ['diary'], ['water']]);
    expect(value.importFile).not.toHaveBeenCalled();
    expect(value.restorePrevious).not.toHaveBeenCalled();
    expect(value.onReplaced).not.toHaveBeenCalled();
  });
});
