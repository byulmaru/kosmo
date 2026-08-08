import assert from 'node:assert/strict';
import test from 'node:test';

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
