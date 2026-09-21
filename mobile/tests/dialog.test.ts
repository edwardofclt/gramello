// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppDialog } from '../src/components/AppDialog';

type ModalProps = { children: ReactNode; onShow: () => void; onRequestClose: () => void };
const native = vi.hoisted(() => ({ web: false, modal: null as ModalProps | null }));

// Drive native presentation events explicitly; no simulator is required.
vi.mock('react-native', () => {
  const view = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return {
    Modal: (props: ModalProps) => { native.modal = props; return view(props); },
    KeyboardAvoidingView: view, ScrollView: view, Text: view, View: view, Pressable: view,
    Platform: { get OS() { return native.web ? 'web' : 'ios'; } },
  };
});
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}));
vi.mock('lucide-react-native', () => ({ X: () => null }));
vi.mock('../src/components/ui', () => ({
  get isWeb() { return native.web; }, colors: {}, styles: {},
  useLayout: () => ({ height: 844, desktop: false }),
  Action: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) =>
    createElement('button', { onClick: onPress, disabled }, label),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  native.web = false;
  native.modal = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function SearchForm() {
  const [query, setQuery] = useState('');
  return createElement('input', { 'aria-label': 'Search foods', autoFocus: true, value: query,
    onInput: (event: { currentTarget: HTMLInputElement }) => setQuery(event.currentTarget.value) });
}

async function render(onClose = vi.fn(), busy = false, title = 'Add food') {
  const props = { title, onClose, busy, children: createElement(SearchForm) };
  await act(async () => root.render(createElement(AppDialog, props)));
}

it('waits for native presentation before auto-focus and preserves the form through updates', async () => {
  const onClose = vi.fn();
  const focus = vi.spyOn(HTMLElement.prototype, 'focus');
  await render(onClose);
  expect(container.querySelector('input')).toBeNull();
  expect(focus).not.toHaveBeenCalled();
  await act(async () => native.modal!.onRequestClose());
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => native.modal!.onShow());
  const input = container.querySelector('input')!;
  expect(document.activeElement).toBe(input);
  await act(async () => {
    input.value = 'chicken';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await render(onClose, true, 'Choose amount');
  await act(async () => native.modal!.onRequestClose());
  expect(onClose).not.toHaveBeenCalled();
  await render(onClose);
  expect(container.querySelector('input')).toBe(input);
  expect(input.value).toBe('chicken');
  expect(document.activeElement).toBe(input);
  expect(focus).toHaveBeenCalledTimes(1);
  await act(async () => native.modal!.onRequestClose());
  expect(onClose).toHaveBeenCalledOnce();
});

it('waits for each new native sheet to be presented when reopened', async () => {
  await render();
  await act(async () => native.modal!.onShow());
  expect(container.querySelector('input')).not.toBeNull();
  await act(async () => root.render(null));
  await render();
  expect(container.querySelector('input')).toBeNull();
  await act(async () => native.modal!.onShow());
  expect(document.activeElement).toBe(container.querySelector('input'));
});

it('renders and focuses browser forms immediately without waiting for onShow', async () => {
  native.web = true;
  const onClose = vi.fn();
  await render(onClose);
  expect(document.activeElement).toBe(container.querySelector('input'));
  await act(async () => container.querySelector('button')!.click());
  expect(onClose).toHaveBeenCalledOnce();
});
