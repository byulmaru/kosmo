import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeGraphQLRequest, formatGraphQLError } from './network';
import { RelayTransportError } from './transportError';
import type { UploadableMap } from 'relay-runtime';

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

    assert.equal(capturedUrl, 'https://api.kos.moe/graphql');
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

    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://kos.moe' } },
    });

    try {
      await executeGraphQLRequest(request, {}, 'must-not-leave-web', fakeFetch);

      assert.equal(capturedUrl, 'https://kos.moe/graphql');
      assert.equal(captured?.credentials, 'include');
      assert.equal((captured?.headers as Record<string, string>).authorization, undefined);
    } finally {
      if (windowDescriptor) {
        Object.defineProperty(globalThis, 'window', windowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('uploadables가 있으면 GraphQL multipart operations map과 파일을 보낸다', async () => {
    let captured: RequestInit | undefined;
    const fakeFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ data: { submitFeedback: { completed: true } } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    };
    const uploadables: UploadableMap = {
      'input.attachments.0': new Blob(['image'], { type: 'image/png' }),
    };
    const restoreNavigator = stubNavigatorProduct('ReactNative');

    try {
      await executeGraphQLRequest(
        { ...request, name: 'SubmitFeedbackMutation' },
        { input: { body: 'body', kind: 'POSITIVE', attachments: [null] } },
        'native-token',
        fakeFetch,
        uploadables,
      );
    } finally {
      restoreNavigator();
    }

    assert.equal((captured?.headers as Record<string, string>)['content-type'], undefined);
    const formData = captured?.body as FormData;
    assert.deepEqual(JSON.parse(String(formData.get('operations'))), {
      operationName: 'SubmitFeedbackMutation',
      query: request.text,
      variables: { input: { body: 'body', kind: 'POSITIVE', attachments: [null] } },
    });
    assert.deepEqual(JSON.parse(String(formData.get('map'))), {
      '0': ['variables.input.attachments.0'],
    });
    const file = formData.get('0');
    assert.ok(file instanceof Blob);
    assert.equal(file.type, 'image/png');
    assert.equal(await file.text(), 'image');
  });

  it('fetch rejection을 원인과 함께 Relay transport 오류로 표시한다', async () => {
    const cause = new TypeError('fetch failed');

    await assert.rejects(
      executeGraphQLRequest(request, {}, null, async () => {
        throw cause;
      }),
      (error: unknown) => {
        assert.ok(error instanceof RelayTransportError);
        assert.equal(error.message, 'fetch failed');
        assert.equal(error.cause, cause);
        return true;
      },
    );
  });

  it('동기 fetch throw는 원래 오류로 유지한다', async () => {
    const cause = new Error('fetch setup failed');

    await assert.rejects(
      executeGraphQLRequest(request, {}, null, () => {
        throw cause;
      }),
      (error: unknown) => {
        assert.equal(error, cause);
        assert.equal(error instanceof RelayTransportError, false);
        return true;
      },
    );
  });

  it('fetch 전 request serialization 오류는 transport marker를 사용하지 않는다', async () => {
    const variables = { invalid: BigInt(1) } as unknown as Record<string, unknown>;

    await assert.rejects(
      executeGraphQLRequest(request, variables, null, async () => {
        assert.fail('fetch should not be called');
      }),
      (error: unknown) => {
        assert.ok(error instanceof TypeError);
        assert.equal(error instanceof RelayTransportError, false);
        return true;
      },
    );
  });

  it('HTTP 오류와 GraphQL 오류는 transport marker를 사용하지 않는다', async () => {
    await assert.rejects(
      executeGraphQLRequest(
        request,
        {},
        null,
        async () =>
          new Response(JSON.stringify({ errors: [{ message: 'server unavailable' }] }), {
            status: 503,
          }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'server unavailable');
        assert.equal(error instanceof RelayTransportError, false);
        return true;
      },
    );

    const response = await executeGraphQLRequest(
      request,
      {},
      null,
      async () =>
        new Response(JSON.stringify({ errors: [{ message: 'field failed' }] }), {
          status: 200,
        }),
    );
    assert.deepEqual(response, { errors: [{ message: 'field failed' }] });
  });

  it('응답 JSON parsing 오류는 transport marker를 사용하지 않는다', async () => {
    await assert.rejects(
      executeGraphQLRequest(
        request,
        {},
        null,
        async () => new Response('not json', { status: 200 }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'GraphQL response was not JSON.');
        assert.equal(error instanceof RelayTransportError, false);
        return true;
      },
    );
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
