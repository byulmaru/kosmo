import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const platform = { OS: 'ios' };
const nativeFocusEvents: Array<{ target: unknown; eventType: string }> = [];
mock.module('react-native', {
  exports: {
    AccessibilityInfo: {
      sendAccessibilityEvent: (target: unknown, eventType: string) =>
        nativeFocusEvents.push({ target, eventType }),
    },
    Platform: platform,
  },
} as unknown as Parameters<typeof mock.module>[1]);

test('focus target이 사라지면 남아 있는 Post surface를 사용한다', async () => {
  const module = await import('./postMediaViewerSession');
  let originFocused = 0;
  let fallbackFocused = 0;
  const originTarget = { focus: () => originFocused++, isConnected: false };
  const fallbackTarget = { focus: () => fallbackFocused++ };
  module.focusPostMediaViewerTarget(
    { current: originTarget as never },
    { current: fallbackTarget as never },
  );

  assert.equal(originFocused, 0);
  assert.equal(fallbackFocused, 1);
  assert.deepEqual(nativeFocusEvents, [{ target: fallbackTarget, eventType: 'focus' }]);
});

test('Native target에는 실제 accessibility focus event를 보낸다', async () => {
  const module = await import('./postMediaViewerSession');
  nativeFocusEvents.length = 0;
  const target = {};
  module.focusPostMediaViewerTarget({ current: target as never });
  assert.deepEqual(nativeFocusEvents, [{ target, eventType: 'focus' }]);
});
