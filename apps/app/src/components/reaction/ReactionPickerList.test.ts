import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ListModule from './ReactionPickerList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let platform = 'web';
const offsets: number[] = [];
const mockModule = (name: string, exports: object) =>
  mock.module(name, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('react-native', {
  FlatList: forwardRef(function List(props: object, ref) {
    useImperativeHandle(ref, () => ({
      scrollToOffset: ({ offset }: { offset: number }) => offsets.push(offset),
    }));
    return createElement('FlatList', props);
  }),
  Platform: {
    get OS() {
      return platform;
    },
  },
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View' as unknown as ElementType,
});
mockModule('@/theme/ThemeProvider', { useTheme: () => ({ foregroundSecondary: 'gray' }) });
let module: typeof ListModule;
before(async () => {
  module = await import('./ReactionPickerList');
});
beforeEach(() => {
  platform = 'web';
  offsets.length = 0;
});
function render() {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(module.ReactionPickerList, {
        data: [],
        renderItem: () => null,
        scrollbar: true,
      }),
    );
  });
  const list = () => renderer.root.findByType('FlatList' as unknown as ElementType);
  act(() => {
    list().props.onLayout({ nativeEvent: { layout: { height: 200 } } });
  });
  act(() => {
    list().props.onContentSizeChange(200, 1200);
  });
  return {
    renderer,
    list,
    thumb: () => renderer.root.findByProps({ testID: 'full-reaction-picker-scrollbar' }),
  };
}
function scroll(list: ReturnType<typeof render>['list'], y: number) {
  act(() => list().props.onScroll({ nativeEvent: { contentOffset: { y } } }));
}
function pointer(y: number, id = 1) {
  return {
    nativeEvent: { button: 0, isPrimary: true, pointerId: id, pageY: y },
    currentTarget: { setPointerCapture() {} },
    preventDefault() {},
    stopPropagation() {},
  };
}
test('web thumb moves the same list to the middle and both ends; holding survives idle and cancel restores scrolling', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { renderer, list, thumb } = render();
  assert.equal(thumb().props.pointerEvents, 'none');
  scroll(list, 0);
  assert.equal(thumb().props.pointerEvents, 'auto');
  act(() => thumb().props.onPointerDown(pointer(100)));
  act(() => {
    mock.timers.tick(2000);
  });
  assert.equal(thumb().props.pointerEvents, 'auto');
  act(() => thumb().props.onPointerMove(pointer(176)));
  assert.ok(offsets.at(-1)! > 400 && offsets.at(-1)! < 600);
  act(() => thumb().props.onPointerMove(pointer(10000)));
  assert.equal(offsets.at(-1), 1000);
  act(() => thumb().props.onPointerMove(pointer(-10000)));
  assert.equal(offsets.at(-1), 0);
  act(() => thumb().props.onPointerCancel(pointer(0)));
  assert.equal(thumb().props.pointerEvents, 'none');
  const count = offsets.length;
  act(() => thumb().props.onPointerMove(pointer(200)));
  assert.equal(offsets.length, count);
  scroll(list, 300);
  act(() => {
    mock.timers.tick(2000);
  });
  assert.equal(thumb().props.pointerEvents, 'none');
  act(() => renderer.unmount());
  mock.timers.reset();
});
test('native responder terminates, clamps resized content and leaves short lists without a bar', () => {
  platform = 'ios';
  const { renderer, list, thumb } = render();
  scroll(list, 500);
  act(() => thumb().props.onResponderGrant({ nativeEvent: { pageY: 100 } }));
  act(() => thumb().props.onResponderMove({ nativeEvent: { pageY: 10000 } }));
  assert.equal(offsets.at(-1), 1000);
  act(() => thumb().props.onResponderTerminate());
  assert.equal(thumb().props.pointerEvents, 'none');
  scroll(list, 1000);
  act(() => list().props.onContentSizeChange(200, 400));
  assert.equal(thumb().props.accessibilityValue.now, 200);
  act(() => list().props.onLayout({ nativeEvent: { layout: { height: 500 } } }));
  assert.equal(
    renderer.root.findAllByProps({ testID: 'full-reaction-picker-scrollbar' }).length,
    0,
  );
  act(() => renderer.unmount());
});
test('keyboard and accessibility actions scroll without drag and query remount resets the bar', () => {
  const { renderer, thumb } = render();
  act(() => thumb().props.onFocus());
  assert.equal(thumb().props.pointerEvents, 'auto');
  act(() => thumb().props.onKeyDown({ key: 'End', preventDefault() {} }));
  assert.equal(offsets.at(-1), 1000);
  act(() => thumb().props.onKeyDown({ key: 'Home', preventDefault() {} }));
  assert.equal(offsets.at(-1), 0);
  act(() => thumb().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
  assert.equal(offsets.at(-1), 200);
  act(() =>
    renderer.update(
      createElement(module.ReactionPickerList, {
        key: 'new-query',
        data: [],
        renderItem: () => null,
        scrollbar: true,
      }),
    ),
  );
  assert.equal(
    renderer.root.findAllByProps({ testID: 'full-reaction-picker-scrollbar' }).length,
    0,
  );
  act(() => renderer.unmount());
});

// Native synthetic events are released after the callback, before a queued update may run.
test('queued Native scroll updates do not retain pooled events', () => {
  platform = 'ios';
  const { renderer, list, thumb } = render();
  const event: { nativeEvent: { contentOffset: { y: number } } | null } = {
    nativeEvent: { contentOffset: { y: 500 } },
  };
  act(() => {
    list().props.onScroll({ nativeEvent: { contentOffset: { y: 100 } } });
    list().props.onScroll(event);
    event.nativeEvent = null;
  });
  assert.equal(thumb().props.accessibilityValue.now, 500);
  act(() => renderer.unmount());
});
