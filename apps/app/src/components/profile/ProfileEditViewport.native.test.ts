import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ProfileEditViewport as NativeViewport } from './ProfileEditViewport.native';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let frame = { height: 784, width: 402 };
let headerHeight = 126;
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router/react-navigation', {
  useFrameSize: <T>(select: (value: typeof frame) => T) => select(frame),
  useHeaderHeight: () => headerHeight,
});
mockModule('react-native', { View: 'View' });

let ProfileEditViewport: typeof NativeViewport;

before(async () => {
  ({ ProfileEditViewport } = await import('./ProfileEditViewport.native'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  frame = { height: 784, width: 402 };
  headerHeight = 126;
});

async function renderViewport() {
  await act(async () => {
    const element = createElement(ProfileEditViewport, null, createElement('Editor'));
    if (renderer) {
      renderer.update(element);
    } else {
      renderer = create(element);
    }
  });
  assert.ok(renderer);
  return renderer.root.findByType('View' as never).props.style.height as number;
}

test('Native edit viewport excludes the measured Stack header from the navigator frame', async () => {
  assert.equal(await renderViewport(), 658);

  frame = { height: 843.4, width: 411.4 };
  headerHeight = 118.1;
  assert.ok(Math.abs((await renderViewport()) - 725.3) < 0.01);
});

test('Native edit viewport follows frame resizing and header relayout without remounting content', async () => {
  await renderViewport();
  assert.ok(renderer);
  const editor = renderer.root.findByType('Editor' as never);

  frame = { height: 500, width: 800 };
  assert.equal(await renderViewport(), 374);
  headerHeight = 152;
  assert.equal(await renderViewport(), 348);
  assert.equal(renderer.root.findByType('Editor' as never), editor);
});

test('Native edit viewport does not request a negative height when the frame is smaller than its header', async () => {
  frame = { height: 90, width: 402 };
  assert.equal(await renderViewport(), 0);
});

test('Web edit viewport leaves content in document flow without a height wrapper', async () => {
  const { ProfileEditViewport: WebViewport } = await import('./ProfileEditViewport');
  await act(async () => {
    renderer = create(createElement(WebViewport, null, createElement('Editor')));
  });
  assert.ok(renderer);
  assert.deepEqual(renderer.toJSON(), { children: null, props: {}, type: 'Editor' });
});
