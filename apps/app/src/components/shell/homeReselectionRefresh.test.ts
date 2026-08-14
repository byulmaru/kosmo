import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createHomeReselectionRefresh } from './homeReselectionRefresh';

test('scroll은 매번 실행하고 settle 전에는 request를 한 번만 시작한다', () => {
  let settle: () => void = () => undefined;
  const scrollToTop = mock.fn();
  const request = mock.fn((onSettled: () => void) => {
    settle = onSettled;
    return { unsubscribe: mock.fn() };
  });
  const refresh = createHomeReselectionRefresh({ request, scrollToTop });

  refresh.activate();
  refresh.activate();
  assert.equal(scrollToTop.mock.callCount(), 2);
  assert.equal(request.mock.callCount(), 1);

  settle();
  refresh.activate();
  assert.equal(scrollToTop.mock.callCount(), 3);
  assert.equal(request.mock.callCount(), 2);
});

test('dispose는 active request를 취소하고 stale settle이 다음 request를 풀지 않는다', () => {
  const settles: Array<() => void> = [];
  const unsubscribes: Array<ReturnType<typeof mock.fn>> = [];
  const request = mock.fn((onSettled: () => void) => {
    settles.push(onSettled);
    const unsubscribe = mock.fn();
    unsubscribes.push(unsubscribe);
    return { unsubscribe };
  });
  const refresh = createHomeReselectionRefresh({ request, scrollToTop: () => undefined });

  refresh.activate();
  refresh.dispose();
  assert.equal(unsubscribes[0]?.mock.callCount(), 1);

  refresh.activate();
  settles[0]?.();
  refresh.activate();
  assert.equal(request.mock.callCount(), 2);

  settles[1]?.();
  refresh.activate();
  assert.equal(request.mock.callCount(), 3);
});
