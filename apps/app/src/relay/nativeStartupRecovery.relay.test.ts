import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { RelayEnvironmentProvider, useLazyLoadQuery } from 'react-relay';
import { act, create } from 'react-test-renderer';
import { commitLocalUpdate, fetchQuery } from 'relay-runtime';
import SessionQuery from '../session/__generated__/SessionProviderQuery.graphql';
import { NativeStartupRecovery } from './nativeStartupRecovery';
import { NativeStartupRecoveryContext } from './NativeStartupRecoveryContext';
import { RelayTransportError } from './transportError';
import type { AppStateStatus } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { Environment } from 'relay-runtime';
import type {
  RouteBoundary as RouteBoundaryType,
  useRouteBoundary as UseRouteBoundary,
} from '../components/RouteBoundary';
import type { SessionProviderQuery } from '../session/__generated__/SessionProviderQuery.graphql';
import type { createRelayEnvironment as CreateRelayEnvironment } from './environment';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mock.module('@/observability/sentry', {
  exports: { captureHandledMessage: () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/ui/StateView', {
  exports: { StateView: (props: object) => createElement('StateView', props) },
} as unknown as Parameters<typeof mock.module>[1]);

let createRelayEnvironment: typeof CreateRelayEnvironment;
let RouteBoundary: typeof RouteBoundaryType;
let useRouteBoundary: typeof UseRouteBoundary;
let renderer: ReactTestRenderer | null = null;
let startupLifecycle: NativeStartupRecovery | null = null;
let originalFetch: typeof fetch;
let originalNavigator: PropertyDescriptor | undefined;
const startupOptions = { networkCacheConfig: { metadata: { nativeStartup: true } } };

before(async () => {
  ({ createRelayEnvironment } = await import('./environment'));
  ({ RouteBoundary, useRouteBoundary } = await import('../components/RouteBoundary'));
});
beforeEach(() => {
  startupLifecycle = null;
  originalFetch = globalThis.fetch;
  originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { product: 'ReactNative' },
  });
  mock.timers.enable({ apis: ['setTimeout'] });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  globalThis.fetch = originalFetch;
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    Reflect.deleteProperty(globalThis, 'navigator');
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
function appState() {
  const listeners = new Set<(state: AppStateStatus) => void>();
  return {
    currentState: 'active' as AppStateStatus,
    addEventListener(_event: 'change', listener: (state: AppStateStatus) => void) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    change(state: AppStateStatus) {
      this.currentState = state;
      for (const listener of listeners) {
        listener(state);
      }
    },
  };
}
function response(name = 'A') {
  return new Response(
    JSON.stringify({
      data: {
        currentSession: { id: `session-${name}`, selectedProfile: { id: `profile-${name}` } },
        me: { id: `account-${name}`, name },
      },
    }),
    { status: 200 },
  );
}
function QueryResult() {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<SessionProviderQuery>(
    SessionQuery,
    {},
    { fetchKey, ...startupOptions },
  );
  return createElement('QueryResult', { name: data.me?.name });
}
function tree(environment: Environment) {
  return createElement(
    NativeStartupRecoveryContext.Provider,
    { value: startupLifecycle },
    createElement(RelayEnvironmentProvider, {
      environment,
      children: createElement(RouteBoundary, {
        title: '조회 실패',
        loading: createElement('Loading'),
        children: createElement(QueryResult),
      }),
    }),
  );
}
async function mount(environment: Environment) {
  await act(async () => {
    renderer = create(tree(environment));
  });
}
function resultName() {
  assert.ok(renderer);
  return renderer.root.findByType('QueryResult' as never).props.name;
}

describe('Native 초기 복구의 실제 Relay 경로', () => {
  it('오류 화면에 고정되지 않고 같은 Store의 query를 완료한다', async () => {
    const state = appState();
    const first = deferred<Response>();
    let calls = 0;
    globalThis.fetch = async () => (++calls === 1 ? first.promise : response());
    const environment = createRelayEnvironment(
      'token-A',
      'profile-A',
      new NativeStartupRecovery(state),
    );
    const store = environment.getStore();
    commitLocalUpdate(environment, (records) =>
      records.create('unrelated', 'Profile').setValue('보존', 'displayName'),
    );
    await mount(environment);
    assert.equal(calls, 1);
    await act(async () => {
      state.change('background');
      first.reject(new TypeError('connection lost'));
    });
    assert.equal(renderer!.root.findAllByType('StateView' as never).length, 0);
    assert.equal(calls, 1);
    await act(async () => state.change('active'));
    assert.equal(resultName(), 'A');
    assert.equal(calls, 2);
    assert.equal(environment.getStore(), store);
    assert.equal(store.getSource().get('unrelated')?.displayName, '보존');
    assert.equal(store.getSource().get('profile-A')?.id, 'profile-A');
  });

  it('자동 시도도 실패하면 실제 RouteBoundary의 수동 재시도로 같은 Store에서 복구한다', async () => {
    const state = appState();
    const first = deferred<Response>();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return first.promise;
      }
      if (calls === 2) {
        throw new TypeError('still offline');
      }
      return response();
    };
    const environment = createRelayEnvironment(
      'retained',
      'profile-A',
      new NativeStartupRecovery(state),
    );
    const store = environment.getStore();
    await mount(environment);
    await act(async () => {
      state.change('background');
      state.change('active');
      first.reject(new TypeError('connection lost'));
    });
    assert.equal(calls, 2);
    assert.ok(renderer);
    const fallback = renderer.root.findByType('StateView' as never);
    assert.equal(fallback.props.title, '조회 실패');
    await act(async () => {
      state.change('background');
      state.change('active');
    });
    assert.equal(calls, 2);
    await act(async () => fallback.props.onAction());
    assert.equal(resultName(), 'A');
    assert.equal(calls, 3);
    assert.equal(environment.getStore(), store);
  });

  it('이전 actor의 복구 응답은 새 actor의 화면·Store·요청 credential을 덮어쓰지 않는다', async () => {
    const state = appState();
    const recovery = new NativeStartupRecovery(state);
    const oldResponse = deferred<Response>();
    const sent: Array<{ token: string; profileId: string }> = [];
    let oldCalls = 0;
    globalThis.fetch = async (_url, init) => {
      const token = (init!.headers as Record<string, string>).authorization;
      sent.push({ token, profileId: JSON.parse(String(init!.body)).extensions.selectedProfileId });
      if (token === 'Bearer token-A') {
        return ++oldCalls === 1 ? oldResponse.promise : response('A');
      }
      return response('B');
    };
    const previous = createRelayEnvironment('token-A', 'profile-A', recovery);
    const current = createRelayEnvironment('token-B', 'profile-B', recovery);
    const oldPending = fetchQuery(previous, SessionQuery, {}, startupOptions).toPromise();
    state.change('background');
    state.change('active');
    await mount(current);
    assert.equal(resultName(), 'B');
    await act(async () => {
      oldResponse.reject(new TypeError('late old response'));
      await oldPending;
    });
    assert.equal(resultName(), 'B');
    assert.equal(current.getStore().getSource().get('profile-A'), undefined);
    assert.equal(current.getStore().getSource().get('account-A'), undefined);
    assert.equal(previous.getStore().getSource().get('profile-A')?.id, 'profile-A');
    assert.deepEqual(sent, [
      { token: 'Bearer token-A', profileId: 'profile-A' },
      { token: 'Bearer token-B', profileId: 'profile-B' },
      { token: 'Bearer token-A', profileId: 'profile-A' },
    ]);
  });

  it('같은 operation도 caller가 초기 조회로 지정하지 않으면 재전송하지 않는다', async () => {
    const state = appState();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      state.change('background');
      state.change('active');
      throw new TypeError('ordinary failure');
    };
    const environment = createRelayEnvironment('token', null, new NativeStartupRecovery(state));
    await assert.rejects(
      fetchQuery(environment, SessionQuery, {}).toPromise(),
      RelayTransportError,
    );
    assert.equal(calls, 1);
  });

  it('초기 Home pending에서 다른 route가 표시되면 이후 actor query는 자동 재시도하지 않는다', async () => {
    const state = appState();
    startupLifecycle = new NativeStartupRecovery(state);
    startupLifecycle.sessionReady();
    const first = deferred<Response>();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return first.promise;
      }
      state.change('background');
      state.change('active');
      throw new TypeError('later normal request');
    };
    const initial = createRelayEnvironment('token-A', 'profile-A', startupLifecycle);
    await mount(initial);
    await act(async () =>
      renderer!.update(
        createElement(
          NativeStartupRecoveryContext.Provider,
          { value: startupLifecycle },
          createElement(RouteBoundary, {
            title: '로컬 조회 실패',
            loading: null,
            children: createElement('LocalLoaded'),
          }),
        ),
      ),
    );
    assert.equal(renderer!.root.findAllByType('LocalLoaded' as never).length, 1);
    const nextActor = createRelayEnvironment('token-B', 'profile-B', startupLifecycle);
    await assert.rejects(
      fetchQuery(nextActor, SessionQuery, {}, startupOptions).toPromise(),
      RelayTransportError,
    );
    assert.equal(calls, 2);
    await act(async () => first.resolve(response()));
  });
});
