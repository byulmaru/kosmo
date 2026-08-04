import assert from 'node:assert/strict';
import test from 'node:test';

test('viewer session은 선택 index와 origin을 현재 Post identity에 묶는다', async () => {
  const module = await import('./postMediaViewerSession').catch(() => null);
  assert.ok(module, 'post media viewer session module must exist');
  const originControl = { current: null };

  const session = module.createPostMediaViewerSession(
    'profile-1:post-1:content-1',
    2,
    originControl,
  );

  assert.equal(session.identity, 'profile-1:post-1:content-1');
  assert.equal(session.selectedIndex, 2);
  assert.equal(session.originControl, originControl);
});

test('현재 Post identity나 표시 가능성이 사라지면 열린 session을 폐기한다', async () => {
  const module = await import('./postMediaViewerSession').catch(() => null);
  assert.ok(module, 'post media viewer session module must exist');
  const session = module.createPostMediaViewerSession('profile-1:post-1:content-1', 1, {
    current: null,
  });

  assert.equal(
    module.reconcilePostMediaViewerSession(session, 'profile-1:post-1:content-1', true),
    session,
  );
  assert.equal(
    module.reconcilePostMediaViewerSession(session, 'profile-2:post-1:content-1', true),
    null,
  );
  assert.equal(
    module.reconcilePostMediaViewerSession(session, 'profile-1:post-1:content-1', false),
    null,
  );
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
