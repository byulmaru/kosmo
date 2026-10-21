import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { GestureResponderEvent, LayoutChangeEvent, ViewProps } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostDetailBackground as Component } from './PostDetailBackground';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
mock.module('react-native', {
  exports: { View: 'div', Platform: { OS: 'web' }, findNodeHandle: () => null },
} as unknown as Parameters<typeof mock.module>[1]);
let PostDetailBackground: typeof Component;
before(async () => {
  ({ PostDetailBackground } = await import('./PostDetailBackground'));
});
const touch = (x: number) =>
  ({
    nativeEvent: { pageX: x, pageY: 50, locationX: x, locationY: 50 },
  }) as GestureResponderEvent;
const viewProps = (renderer: ReactTestRenderer): ViewProps => renderer.root.findByType('div').props;

test('background taps and drag cancellation survive a feedback re-render without a new layout event', async () => {
  let presses = 0;
  const onBackgroundPress = () => {
    presses += 1;
  };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(PostDetailBackground, { onBackgroundPress, testID: 'initial' }),
    );
  });
  try {
    await act(async () => {
      viewProps(renderer).onLayout?.({
        nativeEvent: { layout: { width: 100, height: 100 } },
      } as LayoutChangeEvent);
    });
    viewProps(renderer).onResponderGrant?.(touch(50));
    await act(async () =>
      renderer.update(
        createElement(PostDetailBackground, { onBackgroundPress, testID: 'feedback' }),
      ),
    );
    viewProps(renderer).onResponderRelease?.(touch(50));
    assert.equal(presses, 1);

    viewProps(renderer).onResponderGrant?.(touch(50));
    viewProps(renderer).onResponderMove?.(touch(80));
    await act(async () =>
      renderer.update(
        createElement(PostDetailBackground, { onBackgroundPress, testID: 'resting' }),
      ),
    );
    viewProps(renderer).onResponderRelease?.(touch(50));
    assert.equal(presses, 1);
    viewProps(renderer).onResponderGrant?.(touch(50));
    viewProps(renderer).onResponderRelease?.(touch(50));
    assert.equal(presses, 2);
    let newPresses = 0;
    await act(async () =>
      renderer.update(
        createElement(PostDetailBackground, {
          onBackgroundPress: () => {
            newPresses += 1;
          },
          testID: 'new-post-target',
        }),
      ),
    );
    viewProps(renderer).onResponderGrant?.(touch(50));
    viewProps(renderer).onResponderRelease?.(touch(50));
    assert.equal(newPresses, 1);
    assert.equal(presses, 2);
  } finally {
    await act(async () => renderer.unmount());
  }
});
