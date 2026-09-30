// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../src/catalog/updater';

vi.mock('react-native', () => ({
  View: ({ children, accessibilityRole, accessibilityLabel, accessibilityValue }: {
    children?: ReactNode; accessibilityRole?: string; accessibilityLabel?: string; accessibilityValue?: { now?: number; text?: string };
  }) => createElement('div', { role: accessibilityRole, 'aria-label': accessibilityLabel,
    'aria-valuenow': accessibilityValue?.now, 'aria-valuetext': accessibilityValue?.text }, children),
  Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
  ActivityIndicator: () => createElement('span', null, 'Loading'),
}));
vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: ReactNode }) => createElement('svg', null, children),
  Circle: () => createElement('circle'),
}));
vi.mock('../src/components/ui', () => ({ colors: {}, styles: {} }));
import { CatalogDownloadIndicator, CatalogDownloadProgress } from '../src/components/CatalogDownloadProgress';

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it('subscribes to automatic progress without starting another update and hides after completion', async () => {
  let status: UpdateStatus = { phase: 'idle' };
  const listeners = new Set<() => void>();
  const updater = {
    getStatus: () => status,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    check: async () => { throw new Error('Rendering progress must not start another download.'); },
  };
  const emit = async (next: UpdateStatus) => {
    await act(async () => { status = next; for (const listener of listeners) listener(); });
  };
  await act(async () => root.render(createElement(CatalogDownloadIndicator, { updater })));
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  await emit({ phase: 'checking' });
  expect(container.querySelector('[role="progressbar"]')?.hasAttribute('aria-valuenow')).toBe(false);
  await emit({ phase: 'downloading', downloadedBytes: 2048, totalBytes: 4096 });
  expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
  expect(container.textContent).toContain('50%');
  await emit({ phase: 'updated' });
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
});

it('keeps the Settings bar visible while verification finishes and hides it on failure', async () => {
  await act(async () => root.render(createElement(CatalogDownloadProgress, {
    status: { phase: 'downloading', downloadedBytes: 4096, totalBytes: 4096, completedPacks: 0, totalPacks: 1 },
  })));
  expect(container.textContent).toContain('Finishing food catalog update…');
  expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
  await act(async () => root.render(createElement(CatalogDownloadProgress, { status: { phase: 'error', error: 'Offline' } })));
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
});
