import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as DropdownModule from './Dropdown.web';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('react-native', { View: 'View', StyleSheet: { create: <T>(value: T) => value } });
mockModule('@/theme/tokens', { spacing: { sm: 8 } });
mockModule('./OverlayPortal', { OverlayPortal: ({ children }: { children: unknown }) => children });
let Dropdown: typeof DropdownModule.Dropdown;
let renderer: ReactTestRenderer | undefined;
before(async () => {
  ({ Dropdown } = await import('./Dropdown.web'));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

function fixture() {
  const documentListeners = new Map<string, (event: never) => void>();
  const viewportListeners = new Map<string, () => void>();
  const viewport = {
    width: 390,
    height: 320,
    offsetLeft: 0,
    offsetTop: 0,
    addEventListener: (name: string, listener: () => void) => viewportListeners.set(name, listener),
    removeEventListener: (name: string) => viewportListeners.delete(name),
  };
  const ownerDocument = {
    defaultView: {
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: viewport,
      addEventListener() {},
      removeEventListener() {},
    },
    addEventListener: (name: string, listener: (event: never) => void) =>
      documentListeners.set(name, listener),
    removeEventListener: (name: string) => documentListeners.delete(name),
  };
  const triggerTarget = {};
  const contentTarget = {};
  const trigger = {
    ownerDocument,
    contains: (target: unknown) => target === triggerTarget,
    getBoundingClientRect: () => ({ left: 350, right: 390, top: 250, bottom: 290 }),
  };
  const content = {
    contains: (target: unknown) => target === contentTarget,
    getBoundingClientRect: () => ({ width: 280, height: 240 }),
  };
  return {
    trigger,
    content,
    triggerTarget,
    contentTarget,
    documentListeners,
    viewportListeners,
    viewport,
  };
}

test('dropdown bounds content to the visible viewport and repositions on keyboard/scroll changes', async () => {
  const data = fixture();
  let maxHeight = 0;
  await act(async () => {
    renderer = create(
      createElement(Dropdown, {
        accessibilityLabel: 'profiles',
        open: true,
        minWidth: 280,
        triggerRef: { current: data.trigger } as never,
        onRequestClose() {},
        children: (height: number) => {
          maxHeight = height;
          return null;
        },
      }),
      { createNodeMock: () => data.content },
    );
  });
  const style = () => Object.assign({}, ...renderer!.root.findByType('View' as never).props.style);
  assert.equal(style().left, 102);
  assert.equal(style().top, 72);
  assert.equal(maxHeight, 240);
  data.viewport.height = 200;
  data.viewport.offsetTop = 30;
  await act(async () => data.viewportListeners.get('resize')?.());
  assert.equal(style().top, 38);
  assert.equal(maxHeight, 184);
  data.viewport.offsetLeft = 20;
  await act(async () => data.viewportListeners.get('scroll')?.());
  assert.equal(style().left, 122);
});

test('inside presses stay open; outside and Escape request distinct close reasons and unsubscribe on close', async () => {
  const data = fixture();
  const reasons: string[] = [];
  const props = {
    accessibilityLabel: 'profiles',
    open: true,
    triggerRef: { current: data.trigger } as never,
    onRequestClose: (reason: string) => reasons.push(reason),
    children: () => null,
  };
  await act(async () => {
    renderer = create(createElement(Dropdown, props), { createNodeMock: () => data.content });
  });
  const pointer = (target: unknown) =>
    data.documentListeners.get('pointerdown')?.({ target } as never);
  pointer(data.triggerTarget);
  pointer(data.contentTarget);
  assert.deepEqual(reasons, []);
  pointer({});
  assert.deepEqual(reasons, ['outside']);
  let prevented = false;
  data.documentListeners.get('keydown')?.({
    key: 'Escape',
    preventDefault: () => {
      prevented = true;
    },
  } as never);
  assert.equal(prevented, true);
  assert.deepEqual(reasons, ['outside']);
  let stopped = false;
  data.documentListeners.get('keyup')?.({
    key: 'Escape',
    preventDefault() {},
    stopPropagation: () => {
      stopped = true;
    },
  } as never);
  assert.equal(stopped, true);
  assert.deepEqual(reasons, ['outside', 'escape']);
  await act(async () => renderer?.update(createElement(Dropdown, { ...props, open: false })));
  assert.equal(renderer?.toJSON(), null);
  assert.equal(data.documentListeners.size, 0);
  assert.equal(data.viewportListeners.size, 0);
});

test('exiting content stays rendered without accepting dismissal events', async () => {
  const data = fixture();
  const reasons: string[] = [];
  await act(async () => {
    renderer = create(
      createElement(Dropdown, {
        accessibilityLabel: 'actions',
        open: true,
        active: false,
        triggerRef: { current: data.trigger } as never,
        onRequestClose: (reason) => reasons.push(reason),
        children: () => createElement('item'),
      }),
      { createNodeMock: () => data.content },
    );
  });
  assert.ok(renderer?.toJSON());
  assert.equal(data.documentListeners.has('pointerdown'), false);
  assert.deepEqual(reasons, []);
});
