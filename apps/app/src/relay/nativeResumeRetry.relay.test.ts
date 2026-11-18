import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement, Suspense } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { commitLocalUpdate, commitMutation } from 'relay-runtime';
import { getNativeSessionConfiguration } from '../auth/nativeConfig';
import { serializeStoredSessionToken } from '../auth/sessionToken';
import LogoutMutation from '../session/__generated__/LogoutRevokeCurrentSessionMutation.graphql';
import SessionQuery from '../session/__generated__/SessionProviderQuery.graphql';
import type { AppStateStatus } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { Environment } from 'relay-runtime';
import type { GraphQLErrorBoundary as GraphQLErrorBoundaryType } from '../components/GraphQLErrorBoundary';
import type {
  RouteBoundary as RouteBoundaryType,
  useRouteBoundary as UseRouteBoundary,
} from '../components/RouteBoundary';
import type { SessionProviderQuery } from '../session/__generated__/SessionProviderQuery.graphql';
import type {
  SessionProvider as SessionProviderType,
  useSession as UseSession,
} from '../session/SessionProvider';
import type { createRelayEnvironment as CreateRelayEnvironment } from './environment';
import type { RelayActorProvider as RelayActorProviderType } from './RelayActorProvider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nativeAppState = appState();
const platform = { OS: 'ios' };
const nativeStorage = new Map<string, string>();
const deletedNativeKeys: string[] = [];

mock.module('react-native', {
  exports: { AppState: nativeAppState, Platform: platform },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('expo-secure-store', {
  exports: {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
    isAvailableAsync: async () => true,
    getItemAsync: async (key: string) => nativeStorage.get(key) ?? null,
    deleteItemAsync: async (key: string) => {
      deletedNativeKeys.push(key);
      nativeStorage.delete(key);
    },
    setItemAsync: async (key: string, value: string) => {
      nativeStorage.set(key, value);
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-relay', {
  // Node/tsx needs the artifact binding normally supplied by Relay's Babel transform.
  exports: { ...ReactRelay, graphql: () => SessionQuery },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/Splash', {
  exports: { Splash: () => createElement('Splash') },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/observability/sentry', {
  exports: { captureHandledMessage: () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/ui/StateView', {
  exports: { StateView: (props: object) => createElement('StateView', props) },
} as unknown as Parameters<typeof mock.module>[1]);

let createRelayEnvironment: typeof CreateRelayEnvironment;
let GraphQLErrorBoundary: typeof GraphQLErrorBoundaryType;
let RouteBoundary: typeof RouteBoundaryType;
let useRouteBoundary: typeof UseRouteBoundary;
let RelayActorProvider: typeof RelayActorProviderType;
let SessionProvider: typeof SessionProviderType;
let useSession: typeof UseSession;
let renderer: ReactTestRenderer | null = null;
let originalFetch: typeof fetch;
let originalNavigator: PropertyDescriptor | undefined;

before(async () => {
  ({ createRelayEnvironment } = await import('./environment'));
  ({ GraphQLErrorBoundary } = await import('../components/GraphQLErrorBoundary'));
  ({ RouteBoundary, useRouteBoundary } = await import('../components/RouteBoundary'));
  ({ RelayActorProvider } = await import('./RelayActorProvider'));
  ({ SessionProvider, useSession } = await import('../session/SessionProvider'));
});
beforeEach(() => {
  platform.OS = 'ios';
  nativeAppState.change('active');
  nativeStorage.clear();
  deletedNativeKeys.length = 0;
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
function response(name = 'A', profileId: string | null = `profile-${name}`) {
  return new Response(
    JSON.stringify({
      data: {
        currentSession: {
          id: `session-${name}`,
          selectedProfile: profileId ? { id: profileId } : null,
        },
        me: { id: `account-${name}`, name },
      },
    }),
    { status: 200 },
  );
}
function QueryResult() {
  const { fetchKey, fetchPolicy } = useRouteBoundary();
  const data = ReactRelay.useLazyLoadQuery<SessionProviderQuery>(
    SessionQuery,
    {},
    { fetchKey, fetchPolicy },
  );
  return createElement('QueryResult', { name: data.me?.name });
}
function RootQueryResult() {
  const data = ReactRelay.useLazyLoadQuery<SessionProviderQuery>(SessionQuery, {});
  return createElement('QueryResult', { name: data.me?.name });
}
function SessionResult() {
  return createElement('SessionResult', useSession());
}
function tree(environment: Environment) {
  return createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(RouteBoundary, {
      title: '조회 실패',
      loading: createElement('Loading'),
      children: createElement(QueryResult),
    }),
  });
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

async function resume() {
  await act(async () => {
    nativeAppState.change('background');
    nativeAppState.change('active');
  });
}

describe('Native 복귀 시 실패한 조회의 기존 재시도 경로', () => {
  for (const os of ['ios', 'android']) {
    it(`${os}: 반복 실패 뒤 다음 복귀와 수동 재시도로 같은 Store에서 복구한다`, async () => {
      platform.OS = os;
      let calls = 0;
      globalThis.fetch = async () => {
        if (++calls < 4) {
          throw new TypeError('offline');
        }
        return response();
      };
      const environment = createRelayEnvironment('token-A', 'profile-A');
      const store = environment.getStore();
      commitLocalUpdate(environment, (records) =>
        records.create('unrelated', 'Profile').setValue('보존', 'displayName'),
      );
      await mount(environment);
      assert.equal(calls, 1);
      assert.equal(renderer!.root.findAllByType('StateView' as never).length, 1);
      await resume();
      assert.equal(calls, 2);
      await act(async () => nativeAppState.change('active'));
      assert.equal(calls, 2);
      await resume();
      assert.equal(calls, 3);
      const fallback = renderer!.root.findByType('StateView' as never);
      await act(async () => fallback.props.onAction());
      assert.equal(calls, 4);
      assert.equal(resultName(), 'A');
      assert.equal(environment.getStore(), store);
      assert.equal(store.getSource().get('unrelated')?.displayName, '보존');
      await resume();
      assert.equal(calls, 4);
    });

    it(`${os}: pending 조회를 중복하지 않고 늦은 실패는 다음 복귀에서 복구한다`, async () => {
      platform.OS = os;
      const first = deferred<Response>();
      let calls = 0;
      globalThis.fetch = async () => (++calls === 1 ? first.promise : response());
      await mount(createRelayEnvironment('token-A', 'profile-A'));
      await resume();
      assert.equal(calls, 1);
      await act(async () => first.reject(new TypeError('late failure')));
      assert.equal(calls, 1);
      await resume();
      assert.equal(calls, 2);
      assert.equal(resultName(), 'A');
    });

    it(`${os}: 기본 Provider의 실패한 Session만 재조회하고 credential을 보존한다`, async () => {
      platform.OS = os;
      const credential = serializeStoredSessionToken(getNativeSessionConfiguration(), 'token-A');
      nativeStorage.set('kosmo.session-token', credential);
      const sent: RequestInit[] = [];
      globalThis.fetch = async (_url, init) => {
        sent.push(init!);
        if (sent.length < 3) {
          throw new TypeError('offline');
        }
        return response('A', null);
      };
      await act(async () => {
        renderer = create(
          createElement(
            RelayActorProvider,
            null,
            createElement(SessionProvider, null, createElement(SessionResult)),
          ),
        );
      });
      assert.equal(renderer!.root.findByType('SessionResult' as never).props.status, 'error');
      await resume();
      assert.equal(sent.length, 2);
      await resume();
      assert.equal(sent.length, 3);
      assert.equal(renderer!.root.findByType('SessionResult' as never).props.status, 'valid');
      assert.equal(
        renderer!.root.findByType('SessionResult' as never).props.accountId,
        'account-A',
      );
      assert.deepEqual(sent[2], sent[0]);
      assert.equal((sent[2].headers as Record<string, string>).authorization, 'Bearer token-A');
      assert.equal(nativeStorage.get('kosmo.session-token'), credential);
      assert.deepEqual(deletedNativeKeys, []);
      await resume();
      assert.equal(sent.length, 3);
    });
  }

  it('루트 query 오류도 기존 앱 다시 불러오기 경로로 복귀마다 복구한다', async () => {
    const credential = serializeStoredSessionToken(getNativeSessionConfiguration(), 'token-A');
    nativeStorage.set('kosmo.session-token', credential);
    let calls = 0;
    globalThis.fetch = async () => {
      if (++calls < 3) {
        throw new TypeError('offline');
      }
      return response();
    };
    await act(async () => {
      renderer = create(
        createElement(
          GraphQLErrorBoundary,
          null,
          createElement(
            RelayActorProvider,
            null,
            createElement(
              Suspense,
              { fallback: createElement('Loading') },
              createElement(RootQueryResult),
            ),
          ),
        ),
      );
    });
    assert.equal(calls, 1);
    await resume();
    assert.equal(calls, 2);
    assert.equal(renderer!.root.findAllByType('StateView' as never).length, 1);
    await resume();
    assert.equal(calls, 3);
    assert.equal(resultName(), 'A');
    assert.equal(nativeStorage.get('kosmo.session-token'), credential);
    assert.deepEqual(deletedNativeKeys, []);
    await resume();
    assert.equal(calls, 3);
  });

  it('실패한 mutation은 복귀해도 재실행하지 않는다', async () => {
    const sent: string[] = [];
    globalThis.fetch = async (_url, init) => {
      const name = JSON.parse(String(init!.body)).operationName;
      sent.push(name);
      if (name === 'LogoutRevokeCurrentSessionMutation') {
        throw new TypeError('offline');
      }
      return response();
    };
    const environment = createRelayEnvironment('token-A');
    await mount(environment);
    const failed = new Promise<void>((resolve, reject) => {
      commitMutation(environment, {
        mutation: LogoutMutation,
        variables: {},
        onError: () => resolve(),
        onCompleted: () => reject(new Error('Expected mutation failure')),
      });
    });
    await act(async () => failed);
    await resume();
    assert.deepEqual(sent, ['SessionProviderQuery', 'LogoutRevokeCurrentSessionMutation']);
    assert.equal(resultName(), 'A');
  });

  it('Web 오류는 복귀 이벤트로 재시도하지 않고 수동 재시도를 유지한다', async () => {
    platform.OS = 'web';
    let calls = 0;
    globalThis.fetch = async () => {
      if (++calls === 1) {
        throw new TypeError('offline');
      }
      return response();
    };
    await mount(createRelayEnvironment(null));
    await resume();
    assert.equal(calls, 1);
    await act(async () => renderer!.root.findByType('StateView' as never).props.onAction());
    assert.equal(resultName(), 'A');
    assert.equal(calls, 2);
  });

  it('진행 중 actor A 응답은 전환된 B 화면과 Store를 덮어쓰지 않는다', async () => {
    const oldResponse = deferred<Response>();
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      return (init!.headers as Record<string, string>).authorization === 'Bearer token-A'
        ? oldResponse.promise
        : response('B');
    };
    const previous = createRelayEnvironment('token-A', 'profile-A');
    const current = createRelayEnvironment('token-B', 'profile-B');
    await mount(previous);
    await act(async () => renderer!.update(tree(current)));
    assert.equal(resultName(), 'B');
    await act(async () => oldResponse.resolve(response('A')));
    await resume();
    assert.equal(calls, 2);
    assert.equal(resultName(), 'B');
    assert.equal(current.getStore().getSource().get('account-A'), undefined);
  });
});
