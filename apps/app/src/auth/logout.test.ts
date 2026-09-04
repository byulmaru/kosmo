import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it, mock } from 'node:test';
import { requestWebLogout } from './logout';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

before(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'https://kos.moe' } },
  });
});

after(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

afterEach(() => mock.restoreAll());

describe('Web 로그아웃 요청', () => {
  it('same-origin BFF에 credential 포함 POST를 보내고 204만 성공으로 처리한다', async () => {
    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async () => new Response(null, { status: 204 }),
    );

    await requestWebLogout();

    assert.equal(fetchMock.mock.callCount(), 1);
    const [capturedUrl, capturedInit] = fetchMock.mock.calls[0].arguments;
    assert.equal(capturedUrl, 'https://kos.moe/logout');
    assert.deepEqual(capturedInit, {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    });
  });

  for (const status of [500, 200]) {
    it(`${status} response를 성공으로 처리하지 않는다`, async () => {
      mock.method(globalThis, 'fetch', async () => new Response(null, { status }));

      await assert.rejects(requestWebLogout(), /로그아웃하지 못했습니다/);
    });
  }
});
