import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';
import { requestSubscription } from 'relay-runtime';
import {
  createGraphQLSubscription,
  executeGraphQLRequest,
  formatGraphQLError,
  GraphQLHttpError,
} from './network';
import { RelayTransportError } from './transportError';
import type {
  ConcreteRequest,
  Disposable,
  GraphQLResponse,
  RequestParameters,
  SubscribeFunction,
  Variables,
} from 'relay-runtime';
import type { createRelayEnvironment as CreateRelayEnvironment } from './environment';

const request = {
  cacheID: 'test',
  id: null,
  metadata: {},
  name: 'ViewerQuery',
  operationKind: 'query' as const,
  text: 'query ViewerQuery { currentSession { id } }',
};

const subscriptionRequest: RequestParameters = {
  cacheID: 'subscription-test',
  id: null,
  metadata: {},
  name: 'ProfileUpdatesSubscription',
  operationKind: 'subscription',
  text: 'subscription ProfileUpdatesSubscription($include: Boolean!) { currentSession @include(if: $include) { id } }',
};

const currentSessionFields = [
  { alias: null, args: null, kind: 'ScalarField', name: 'id', storageKey: null },
  {
    alias: null,
    args: null,
    kind: 'ScalarField',
    name: 'unreadNotificationCount',
    storageKey: null,
  },
];
const currentSessionField = {
  alias: null,
  args: null,
  concreteType: 'Session',
  kind: 'LinkedField',
  name: 'currentSession',
  plural: false,
  selections: currentSessionFields,
  storageKey: null,
};
const currentSessionUpdatesSubscription = {
  fragment: {
    argumentDefinitions: [],
    kind: 'Fragment',
    metadata: null,
    name: 'CurrentSessionUpdatesSubscription',
    selections: [currentSessionField],
    type: 'Query',
    abstractKey: null,
  },
  kind: 'Request',
  operation: {
    argumentDefinitions: [],
    kind: 'Operation',
    name: 'CurrentSessionUpdatesSubscription',
    selections: [currentSessionField],
  },
  params: {
    cacheID: 'CurrentSessionUpdatesSubscription',
    id: null,
    metadata: {},
    name: 'CurrentSessionUpdatesSubscription',
    operationKind: 'subscription',
    text: 'subscription CurrentSessionUpdatesSubscription { currentSession { id unreadNotificationCount } }',
  },
} as ConcreteRequest;

mock.module('@/observability/sentry', {
  exports: { captureHandledMessage: () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);

let createRelayEnvironment: typeof CreateRelayEnvironment;

before(async () => {
  ({ createRelayEnvironment } = await import('./environment'));
});

describe('Relay 네트워크', () => {
  it('defers SSE origin and fetch access until a subscription starts', () => {
    const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      get() {
        throw new Error('fetch accessed before subscription');
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        get location() {
          throw new Error('web origin accessed before subscription');
        },
      },
    });

    try {
      assert.doesNotThrow(() => createRelayEnvironment(null, 'profile-a'));
    } finally {
      if (originalFetch) {
        Object.defineProperty(globalThis, 'fetch', originalFetch);
      } else {
        Reflect.deleteProperty(globalThis, 'fetch');
      }
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('native SSE subscription sends actor auth and forwards stream results, GraphQL errors, and completion', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl: RequestInfo | URL | undefined;
    let captured: RequestInit | undefined;
    const variables = { include: true };
    const events = [
      sseEvent('next', { data: { currentSession: { id: 'session-1' } } }),
      sseEvent('next', {
        data: { currentSession: null },
        errors: [{ message: 'session changed' }],
      }),
      sseEvent('complete'),
    ];
    globalThis.fetch = async (input, init) => {
      capturedUrl = input;
      captured = init;
      return sseResponse(events);
    };
    const restoreNavigator = stubNavigatorProduct('ReactNative');

    try {
      const results = await collectSubscription(
        createGraphQLSubscription('native-token', 'profile-a')(subscriptionRequest, variables, {}),
      );

      assert.equal(capturedUrl, 'https://api.kos.moe/graphql');
      assert.equal(captured?.method, 'POST');
      assert.equal(captured?.credentials, 'omit');
      assert.equal(new Headers(captured?.headers).get('accept'), 'text/event-stream');
      assert.equal(new Headers(captured?.headers).get('authorization'), 'Bearer native-token');
      const body = JSON.parse(String(captured?.body)) as {
        extensions: Record<string, unknown>;
        operationName: string;
        query: string;
        variables: Variables;
      };
      assert.equal(body.operationName, subscriptionRequest.name);
      assert.equal(body.query, subscriptionRequest.text);
      assert.deepEqual(body.variables, variables);
      assert.equal(body.extensions.selectedProfileId, 'profile-a');
      assert.deepEqual(results, [
        { data: { currentSession: { id: 'session-1' } } },
        { data: { currentSession: null }, errors: [{ message: 'session changed' }] },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      restoreNavigator();
    }
  });

  it('SSE reports initial and reconnected operation-local callbacks without serializing metadata', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const connectionStates: boolean[] = [];
    const requestBodies: Array<Record<string, unknown>> = [];
    let failFirstStream: (() => void) | undefined;
    let resolveFirstConnected: () => void = () => undefined;
    let resolveReconnected: () => void = () => undefined;
    let rejectReconnect: (error: unknown) => void = () => undefined;
    const firstConnected = new Promise<void>((resolve) => {
      resolveFirstConnected = resolve;
    });
    const reconnected = new Promise<void>((resolve) => {
      resolveReconnected = resolve;
    });
    const reconnectError = new Promise<never>((_resolve, reject) => {
      rejectReconnect = reject;
    });
    let fetchCount = 0;
    globalThis.fetch = async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      fetchCount += 1;
      const body =
        fetchCount === 1
          ? new ReadableStream<Uint8Array>({
              start(controller) {
                failFirstStream = () => controller.error(new TypeError('stream disconnected'));
              },
            })
          : new ReadableStream<Uint8Array>({ start() {} });
      return new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
        status: 200,
      });
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://kos.moe' } },
    });
    mock.timers.enable({ apis: ['setTimeout'] });

    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const observable = createGraphQLSubscription(null, 'profile-a')(
        subscriptionRequest,
        { include: true },
        {
          metadata: {
            onSubscriptionConnected: (reconnected: boolean) => {
              connectionStates.push(reconnected);
              if (reconnected) {
                resolveReconnected();
              } else {
                resolveFirstConnected();
              }
            },
          },
        },
      );
      if (!('subscribe' in observable)) {
        assert.fail('GraphQL subscription did not return a Relay observable.');
      }
      const reconnectedOrFailed = Promise.race([reconnected, reconnectError]);
      subscription = observable.subscribe({ error: rejectReconnect });
      await firstConnected;
      assert.deepEqual(connectionStates, [false]);
      assert.ok(failFirstStream);
      failFirstStream();
      await new Promise<void>((resolve) => setImmediate(resolve));
      mock.timers.runAll();
      await reconnectedOrFailed;

      const expectedRequest = {
        operationName: subscriptionRequest.name,
        query: subscriptionRequest.text,
        variables: { include: true },
        extensions: { selectedProfileId: 'profile-a' },
      };
      assert.deepEqual(connectionStates, [false, true]);
      assert.deepEqual(requestBodies, [expectedRequest, expectedRequest]);
    } finally {
      subscription?.unsubscribe();
      mock.timers.reset();
      globalThis.fetch = originalFetch;
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('web SSE subscription uses BFF cookie credentials without a bearer token', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let capturedUrl: RequestInfo | URL | undefined;
    let captured: RequestInit | undefined;
    globalThis.fetch = async (input, init) => {
      capturedUrl = input;
      captured = init;
      return sseResponse([
        sseEvent('next', { data: { currentSession: { id: 'session-web' } } }),
        sseEvent('complete'),
      ]);
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://kos.moe' } },
    });

    try {
      const results = await collectSubscription(
        createGraphQLSubscription('must-not-leave-web')(subscriptionRequest, { include: true }, {}),
      );

      assert.equal(capturedUrl, 'https://kos.moe/graphql');
      assert.equal(captured?.credentials, 'include');
      const headers = new Headers(captured?.headers);
      assert.equal(headers.get('accept'), 'text/event-stream');
      assert.equal(headers.get('authorization'), null);
      const body = JSON.parse(String(captured?.body)) as {
        extensions?: Record<string, unknown>;
      };
      assert.equal(body.extensions?.selectedProfileId, undefined);
      assert.deepEqual(results, [{ data: { currentSession: { id: 'session-web' } } }]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('aborts an active SSE request when the Relay subscription is disposed', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let signal: AbortSignal | undefined;
    let signalRequestStarted: () => void = () => undefined;
    const requestStarted = new Promise<void>((resolve) => {
      signalRequestStarted = resolve;
    });
    globalThis.fetch = async (_input, init) => {
      signal = init?.signal as AbortSignal | undefined;
      signalRequestStarted();
      return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        headers: { 'content-type': 'text/event-stream' },
        status: 200,
      });
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://kos.moe' } },
    });

    try {
      const observable = createGraphQLSubscription(null)(subscriptionRequest, {}, {});
      if (!('subscribe' in observable)) {
        assert.fail('GraphQL subscription did not return a Relay observable.');
      }
      const subscription = observable.subscribe({ error: () => undefined });
      await requestStarted;
      subscription.unsubscribe();

      assert.equal(signal?.aborted, true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('routes a requestSubscription event through the normalized Relay store', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const eventData = {
      currentSession: { id: 'session-sse', unreadNotificationCount: 9 },
    };
    let requestBody: { extensions?: Record<string, unknown> } | undefined;
    let subscriptionData: unknown;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as typeof requestBody;
      return sseResponse([sseEvent('next', { data: eventData }), sseEvent('complete')]);
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://kos.moe' } },
    });

    let disposable: Disposable | undefined;
    try {
      const environment = createRelayEnvironment(null, 'profile-a');
      const eventReceived = new Promise<void>((resolve, reject) => {
        disposable = requestSubscription(environment, {
          subscription: currentSessionUpdatesSubscription,
          variables: {},
          onError: reject,
          onNext: (data) => {
            subscriptionData = data;
            resolve();
          },
        });
      });
      await eventReceived;

      assert.deepEqual(subscriptionData, eventData);
      assert.deepEqual(environment.getStore().getSource().get('session-sse'), {
        __id: 'session-sse',
        __typename: 'Session',
        id: 'session-sse',
        unreadNotificationCount: 9,
      });
      assert.equal(requestBody?.extensions?.selectedProfileId, 'profile-a');
    } finally {
      disposable?.dispose();
      globalThis.fetch = originalFetch;
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

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

  it('선택된 profile actor는 GraphQL extensions로 전달한다', async () => {
    let captured: RequestInit | undefined;
    const fakeFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ data: { viewer: null } }), { status: 200 });
    };

    await executeGraphQLRequest(request, {}, null, fakeFetch, 'profile-selected');

    assert.deepEqual(JSON.parse(String(captured?.body)), {
      operationName: 'ViewerQuery',
      query: request.text,
      variables: {},
      extensions: { selectedProfileId: 'profile-selected' },
    });
  });

  it('선택된 profile actor가 없으면 selected profile extension을 생략한다', async () => {
    for (const selectedProfileId of [null, ''] as const) {
      let captured: RequestInit | undefined;
      const fakeFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        captured = init;
        return new Response(JSON.stringify({ data: { currentSession: null } }), { status: 200 });
      };

      await executeGraphQLRequest(request, {}, null, fakeFetch, selectedProfileId);

      assert.deepEqual(JSON.parse(String(captured?.body)), {
        operationName: 'ViewerQuery',
        query: request.text,
        variables: {},
      });
    }
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
        assert.ok(error instanceof GraphQLHttpError);
        assert.equal(error.message, 'server unavailable');
        assert.equal(error.name, 'Error');
        assert.equal(error.operationName, request.name);
        assert.equal(error.status, 503);
        assert.equal(Number.isInteger(error.elapsedMs), true);
        assert.equal(error.elapsedMs >= 0, true);
        assert.equal(error instanceof RelayTransportError, false);
        return true;
      },
    );

    await assert.rejects(
      executeGraphQLRequest(request, {}, null, async () => new Response(null, { status: 502 })),
      (error: unknown) => {
        assert.ok(error instanceof GraphQLHttpError);
        assert.equal(error.message, 'GraphQL request failed with HTTP 502.');
        assert.equal(error.operationName, request.name);
        assert.equal(error.status, 502);
        assert.equal(error.elapsedMs >= 0, true);
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

function sseEvent(event: 'next' | 'complete', data?: GraphQLResponse): string {
  return `event: ${event}\n${data === undefined ? '' : `data: ${JSON.stringify(data)}\n`}\n`;
}

function sseResponse(events: readonly string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
    status: 200,
  });
}

async function collectSubscription(
  observable: ReturnType<SubscribeFunction>,
): Promise<GraphQLResponse[]> {
  if (!('subscribe' in observable)) {
    throw new Error('GraphQL subscription did not return a Relay observable.');
  }

  const results: GraphQLResponse[] = [];
  await new Promise<void>((resolve, reject) => {
    observable.subscribe({
      complete: resolve,
      error: reject,
      next: (result) => results.push(result),
    });
  });
  return results;
}
