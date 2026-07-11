import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  executeGraphQLRequest,
  formatGraphQLError,
  getWebOrigin,
  normalizeWebOrigin,
} from './network';

process.env.EXPO_PUBLIC_WEB_ORIGIN = 'http://127.0.0.1:5173';

const request = {
  cacheID: 'test',
  id: null,
  metadata: {},
  name: 'ViewerQuery',
  operationKind: 'query' as const,
  text: 'query ViewerQuery { currentSession { id } }',
};

describe('Relay network', () => {
  it('sends operationName and native bearer token', async () => {
    let captured: RequestInit | undefined;
    const fakeFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ data: { currentSession: null } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    };

    await executeGraphQLRequest(request, {}, 'native-token', fakeFetch);

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

  it('uses cookie credentials without synthesizing a bearer token on web', async () => {
    let captured: RequestInit | undefined;
    const fakeFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    };

    await executeGraphQLRequest(request, {}, null, fakeFetch);

    assert.equal(captured?.credentials, 'include');
    assert.equal((captured?.headers as Record<string, string>).authorization, undefined);
  });

  it('formats Error and unknown failures for the shared boundary', () => {
    assert.equal(formatGraphQLError(new Error('network down')), 'network down');
    assert.equal(formatGraphQLError(null), '요청을 처리하지 못했습니다.');
  });
});

describe('native web origin', () => {
  it('uses the current browser origin before build-time configuration', () => {
    const existingWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'http://localhost:5173' } },
    });

    try {
      assert.equal(getWebOrigin(), 'http://localhost:5173');
    }
    finally {
      if (existingWindow) {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: existingWindow,
        });
      }
      else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('normalizes an HTTPS or loopback origin', () => {
    assert.equal(normalizeWebOrigin('https://kosmo.example/', false), 'https://kosmo.example');
    assert.equal(normalizeWebOrigin('http://127.0.0.1:4173', false), 'http://127.0.0.1:4173');
  });

  it('rejects path-bearing and insecure remote origins by default', () => {
    assert.throws(() => normalizeWebOrigin('https://kosmo.example/app', false));
    assert.throws(() => normalizeWebOrigin('http://kosmo.example', false));
    assert.equal(normalizeWebOrigin('http://192.0.2.1:4173', true), 'http://192.0.2.1:4173');
  });

  it('fails closed without a configured origin outside the browser', () => {
    const configured = process.env.EXPO_PUBLIC_WEB_ORIGIN;
    delete process.env.EXPO_PUBLIC_WEB_ORIGIN;

    try {
      assert.throws(() => getWebOrigin());
    }
    finally {
      process.env.EXPO_PUBLIC_WEB_ORIGIN = configured;
    }
  });
});
