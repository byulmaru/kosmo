import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const platform = { OS: 'web' };
mock.module('react-native', {
  exports: { Platform: platform },
} as unknown as Parameters<typeof mock.module>[1]);

test('focus target이 사라지면 남아 있는 Post surface를 사용한다', async () => {
  const module = await import('./postMediaViewerSession');
  let originFocused = 0;
  let fallbackFocused = 0;
  module.focusPostMediaViewerTarget(
    { current: { focus: () => originFocused++, isConnected: false } as never },
    { current: { focus: () => fallbackFocused++ } as never },
  );

  assert.equal(originFocused, 0);
  assert.equal(fallbackFocused, 1);
});

test('Native dismiss does not move accessibility focus manually', async () => {
  const module = await import('./postMediaViewerSession');
  let focused = 0;

  for (const os of ['ios', 'android']) {
    platform.OS = os;
    module.focusPostMediaViewerTarget({ current: { focus: () => focused++ } as never });
  }

  assert.equal(focused, 0);
});
