import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requestWebLogout } from './logout';

process.env.EXPO_PUBLIC_WEB_ORIGIN = 'http://127.0.0.1:5173';

async function withFetch(implementation: typeof fetch, callback: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = implementation;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe('Web 로그아웃 요청', () => {
  it('same-origin BFF에 credential 포함 POST를 보내고 204만 성공으로 처리한다', async () => {
    let capturedUrl: RequestInfo | URL | undefined;
    let capturedInit: RequestInit | undefined;

    await withFetch(async (input, init) => {
      capturedUrl = input;
      capturedInit = init;
      return new Response(null, { status: 204 });
    }, requestWebLogout);

    assert.equal(capturedUrl, 'http://127.0.0.1:5173/logout');
    assert.deepEqual(capturedInit, {
      cache: 'no-store',
      credentials: 'include',
      method: 'POST',
    });
  });

  it('결과 불명 또는 실패 response를 성공으로 처리하지 않는다', async () => {
    await withFetch(
      async () => new Response(null, { status: 500 }),
      async () => {
        await assert.rejects(requestWebLogout(), /로그아웃하지 못했습니다/);
      },
    );
    await withFetch(
      async () => new Response(null, { status: 200 }),
      async () => {
        await assert.rejects(requestWebLogout(), /로그아웃하지 못했습니다/);
      },
    );
  });
});
