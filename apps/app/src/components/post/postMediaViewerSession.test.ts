import assert from 'node:assert/strict';
import test from 'node:test';

test('viewer session은 선택 index와 origin focus만 보관한다', async () => {
  const module = await import('./postMediaViewerSession').catch(() => null);
  assert.ok(module, 'post media viewer session module must exist');
  const originControl = { current: null };

  const session = module.createPostMediaViewerSession(2, originControl);

  assert.deepEqual(Object.keys(session).sort(), ['originControl', 'selectedIndex']);
  assert.equal(session.selectedIndex, 2);
  assert.equal(session.originControl, originControl);
});

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
