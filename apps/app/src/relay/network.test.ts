import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  executeGraphQLRequest,
  formatGraphQLError,
  getApiOrigin,
  getWebOrigin,
  normalizeApiOrigin,
  normalizeWebOrigin,
} from './network';

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

describe('네이티브 API origin', () => {
  it('설정된 API origin만 사용한다', () => {
    assert.equal(getApiOrigin(), 'http://127.0.0.1:4200');
  });

  it('HTTPS 또는 loopback origin을 정규화한다', () => {
    assert.equal(
      normalizeApiOrigin('https://api.kosmo.example/', false),
      'https://api.kosmo.example',
    );
    assert.equal(normalizeApiOrigin('http://127.0.0.1:4200', false), 'http://127.0.0.1:4200');
  });

  it('path가 있거나 안전하지 않은 remote origin을 기본으로 거부한다', () => {
    assert.throws(() => normalizeApiOrigin('https://api.kosmo.example/graphql', false));
    assert.throws(() => normalizeApiOrigin('http://api.kosmo.example', false));
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

describe('네이티브 web origin', () => {
  it('build-time 설정 전에 현재 browser origin을 사용한다', () => {
    const existingWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'http://localhost:5173' } },
    });

    try {
      assert.equal(getWebOrigin(), 'http://localhost:5173');
    } finally {
      if (existingWindow) {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: existingWindow,
        });
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('HTTPS 또는 loopback origin을 정규화한다', () => {
    assert.equal(normalizeWebOrigin('https://kosmo.example/', false), 'https://kosmo.example');
    assert.equal(normalizeWebOrigin('http://127.0.0.1:4173', false), 'http://127.0.0.1:4173');
  });

  it('path가 있거나 안전하지 않은 remote origin을 기본으로 거부한다', () => {
    assert.throws(() => normalizeWebOrigin('https://kosmo.example/app', false));
    assert.throws(() => normalizeWebOrigin('http://kosmo.example', false));
    assert.equal(normalizeWebOrigin('http://192.0.2.1:4173', true), 'http://192.0.2.1:4173');
  });

  it('browser 밖에서 origin 설정이 없으면 요청을 차단한다', () => {
    const configured = process.env.EXPO_PUBLIC_WEB_ORIGIN;
    delete process.env.EXPO_PUBLIC_WEB_ORIGIN;

    try {
      assert.throws(() => getWebOrigin());
    } finally {
      process.env.EXPO_PUBLIC_WEB_ORIGIN = configured;
    }
  });
});
