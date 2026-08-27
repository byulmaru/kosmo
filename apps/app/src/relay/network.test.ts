import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeGraphQLRequest, formatGraphQLError } from './network';

process.env.EXPO_PUBLIC_API_ORIGIN = 'http://127.0.0.1:4200';
process.env.EXPO_PUBLIC_WEB_ORIGIN = 'http://127.0.0.1:5173';

const request = {
  cacheID: 'test',
  id: null,
  metadata: {},
  name: 'ViewerQuery',
  operationKind: 'query' as const,
  text: 'query ViewerQuery { currentSession { id } }',
};

describe('Relay 네트워크', () => {
  it('native operation을 cookie credential 없이 API로 직접 보낸다', async () => {
    let captured: RequestInit | undefined;
    let capturedUrl: RequestInfo | URL | undefined;
    const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input;
      captured = init;
      return new Response(JSON.stringify({ data: { currentSession: null } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    };

    const restoreNavigator = stubNavigatorProduct('ReactNative');

    try {
      await executeGraphQLRequest(request, {}, 'native-token', fakeFetch);
    } finally {
      restoreNavigator();
    }

    assert.equal(capturedUrl, 'http://127.0.0.1:4200/graphql');
    assert.equal(captured?.credentials, 'omit');
    assert.equal(
      (captured?.headers as Record<string, string>).authorization,
      'Bearer native-token',
    );
    assert.deepEqual(JSON.parse(String(captured?.body)), {
      operationName: 'ViewerQuery',
      query: request.text,
      variables: {},
    });
  });

  it('web BFF cookie transport를 Bearer token 없이 사용한다', async () => {
    let captured: RequestInit | undefined;
    let capturedUrl: RequestInfo | URL | undefined;
    const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input;
      captured = init;
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    };

    await executeGraphQLRequest(request, {}, 'must-not-leave-web', fakeFetch);

    assert.equal(capturedUrl, 'http://127.0.0.1:5173/graphql');
    assert.equal(captured?.credentials, 'include');
    assert.equal((captured?.headers as Record<string, string>).authorization, undefined);
  });

  it('Error와 알 수 없는 실패를 공통 boundary 형식으로 변환한다', () => {
    assert.equal(formatGraphQLError(new Error('network down')), 'network down');
    assert.equal(formatGraphQLError(null), '요청을 처리하지 못했습니다.');
  });
});

function stubNavigatorProduct(product: string): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { product },
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'navigator', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'navigator');
    }
  };
}
