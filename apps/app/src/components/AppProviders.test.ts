import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type QueryName = 'SessionProviderQuery' | 'ShellRecoveryQuery';
type QueryMode = 'error' | 'pending' | 'success';

const queryModes: Record<QueryName, QueryMode> = {
  SessionProviderQuery: 'success',
  ShellRecoveryQuery: 'success',
};
const queryHistory: Array<{ fetchKey: unknown; query: QueryName }> = [];
const pendingSessionQueries: Array<() => void> = [];
const pendingRootRenders: Array<() => void> = [];
const unreadFetches: string[] = [];
let currentEnvironment: FakeEnvironment;
let unreadFailure = false;
let navigationMounts = 0;
let navigationUnmounts = 0;
let relayActorMounts = 0;
let relayActorUnmounts = 0;
let rootShouldThrow = false;
let rootShouldSuspend = false;
let AppProviders: ComponentType<PropsWithChildren>;
let RouteBoundary: ComponentType<{
  children: ReactNode;
  error?: (retry: () => void) => ReactNode;
  loading: ReactNode;
  title: string;
}>;
let useRouteBoundary: () => { fetchKey: number };
let useRelayActor: () => Pick<MockRelayActorValue, 'nativeToken' | 'setNativeSession'>;
let useSession: () => {
  selectedProfileId: string | null;
  sessionId: string | null;
  status: string;
};
let useUnreadNotificationCount: () => number | null;
let UnreadNotificationBadgeController: ComponentType<PropsWithChildren>;
let renderer: ReactTestRenderer | null = null;

type MockRelayActorValue = {
  actorLifecycleKey: string;
  clearNativeSession: () => Promise<void>;
  nativeToken: string | null;
  resetActor: (profileId?: string | null) => void;
  setNativeSession: (token: string) => Promise<void>;
};

const MockRelayActorContext = createContext<MockRelayActorValue | null>(null);

type FakeSnapshot = {
  data: { node: { id: string; unreadNotificationCount: number } | null };
};
type FakeEnvironment = {
  lookup: () => FakeSnapshot;
  retain: () => { dispose: () => void };
  subscribe: (
    _snapshot: FakeSnapshot,
    _callback: (snapshot: FakeSnapshot) => void,
  ) => { dispose: () => void };
};

function MockRelayActorProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    relayActorMounts += 1;
    return () => {
      relayActorUnmounts += 1;
    };
  }, []);

  const [nativeToken, setNativeToken] = useState<string | null>(null);
  const [actorLifecycleKey, setActorLifecycleKey] = useState('actor-session');
  const setNativeSession = useCallback(async (token: string) => {
    currentEnvironment = createEnvironment({ id: 'profile-a', unreadNotificationCount: 7 });
    setNativeToken(token);
    setActorLifecycleKey((current) => `${current}:native`);
  }, []);
  const clearNativeSession = useCallback(async () => {
    setNativeToken(null);
    setActorLifecycleKey((current) => `${current}:guest`);
  }, []);
  const resetActor = useCallback((profileId?: string | null) => {
    setActorLifecycleKey((current) => `${current}:profile:${profileId ?? 'session'}`);
  }, []);
  const value = useMemo(
    () => ({
      actorLifecycleKey,
      clearNativeSession,
      nativeToken,
      resetActor,
      setNativeSession,
    }),
    [actorLifecycleKey, clearNativeSession, nativeToken, resetActor, setNativeSession],
  );

  return createElement(MockRelayActorContext.Provider, { value }, children);
}

function useMockRelayActor(): MockRelayActorValue {
  const value = useContext(MockRelayActorContext);
  if (!value) {
    throw new Error('Mock RelayActorProvider is required.');
  }
  return value;
}

function useMockRelayActorLifecycleKey(): string {
  return useMockRelayActor().actorLifecycleKey;
}

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', { Platform: { OS: 'web' } });
mockModule('expo-router', {
  Slot: () => null,
  useRouter: () => ({ replace: () => undefined }),
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    const query = parts.join('').match(/query (\w+)/)?.[1];
    assert.ok(query);
    return query as QueryName | 'UnreadNotificationBadgeControllerQuery';
  },
  useLazyLoadQuery: (
    query: QueryName,
    _variables: Record<string, unknown>,
    options: { fetchKey?: unknown },
  ) => {
    queryHistory.push({ fetchKey: options.fetchKey, query });
    if (queryModes[query] === 'error') {
      throw new Error(`${query} failed`);
    }
    if (queryModes[query] === 'pending') {
      throw new Promise<void>((resolve) => pendingSessionQueries.push(resolve));
    }
    if (query === 'SessionProviderQuery') {
      return {
        currentSession: { id: 'session-1', selectedProfile: { id: 'profile-a' } },
        me: { id: 'account-1', name: 'Account' },
      };
    }
    return { action: 'ready' };
  },
  useRelayEnvironment: () => currentEnvironment,
});
mockModule('relay-runtime', {
  createOperationDescriptor: (_request: unknown, variables: Record<string, unknown>) => ({
    fragment: {},
    variables,
  }),
  fetchQuery: (_environment: FakeEnvironment, _query: unknown, variables: { id: string }) => {
    unreadFetches.push(variables.id);
    return {
      subscribe: (observer: { error?: (error: Error) => void }) => {
        if (unreadFailure) {
          observer.error?.(new Error('unread count failed'));
        }
        return { unsubscribe: () => undefined };
      },
    };
  },
  getRequest: (query: unknown) => query,
});
mockModule(new URL('../analytics/client.ts', import.meta.url), {
  initializeAnalytics: () => undefined,
});
mockModule(new URL('../analytics/AnalyticsSessionBridge.tsx', import.meta.url), {
  AnalyticsSessionBridge: () => null,
});
mockModule(new URL('../components/post/PostContentWarningRevealContext.tsx', import.meta.url), {
  PostContentWarningRevealProvider: ({ children }: PropsWithChildren) => children,
});
mockModule(new URL('../components/Splash.tsx', import.meta.url), {
  Splash: ({ label }: { label?: string }) => createElement('Splash', { label }),
});
mockModule(new URL('../components/ui/StateView.tsx', import.meta.url), {
  StateView: ({ onAction, title }: { onAction?: () => void; title: string }) =>
    createElement('StateView', { onAction, title }),
});
mockModule(new URL('../theme/ThemeProvider.tsx', import.meta.url), {
  ThemeProvider: ({ children }: PropsWithChildren) => children,
});
mockModule(new URL('../components/ui/ToastProvider.tsx', import.meta.url), {
  ToastProvider: ({ children }: PropsWithChildren) => children,
});
mockModule(new URL('../relay/RelayActorProvider.tsx', import.meta.url), {
  RelayActorProvider: MockRelayActorProvider,
  useRelayActor: useMockRelayActor,
  useRelayActorLifecycleKey: useMockRelayActorLifecycleKey,
});

before(async () => {
  ({ AppProviders } = await import('./AppProviders'));
  ({ RouteBoundary, useRouteBoundary } = await import('./RouteBoundary'));
  ({ useSession } = await import('../session/SessionProvider'));
  ({ useRelayActor } = await import('../relay/RelayActorProvider'));
  ({ UnreadNotificationBadgeController, useUnreadNotificationCount } =
    await import('./shell/UnreadNotificationBadgeController'));
});

beforeEach(() => {
  queryModes.SessionProviderQuery = 'success';
  queryModes.ShellRecoveryQuery = 'success';
  queryHistory.length = 0;
  pendingSessionQueries.length = 0;
  unreadFetches.length = 0;
  unreadFailure = false;
  navigationMounts = 0;
  navigationUnmounts = 0;
  relayActorMounts = 0;
  relayActorUnmounts = 0;
  rootShouldThrow = false;
  rootShouldSuspend = false;
  pendingRootRenders.length = 0;
  currentEnvironment = createEnvironment({ id: 'profile-a', unreadNotificationCount: 7 });
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

function createEnvironment(node: FakeSnapshot['data']['node']): FakeEnvironment {
  const snapshot = { data: { node } };
  return {
    lookup: () => snapshot,
    retain: () => ({ dispose: () => undefined }),
    subscribe: () => ({ dispose: () => undefined }),
  };
}

function ShellRecoveryContent() {
  const { fetchKey } = useRouteBoundary();
  const session = useSession();
  const data = lazyLoadQuery('ShellRecoveryQuery', {}, { fetchKey });
  return createElement('Ready', { action: data.action, status: session.status });
}

function lazyLoadQuery(
  query: QueryName,
  variables: Record<string, unknown>,
  options: { fetchKey?: unknown },
) {
  queryHistory.push({ fetchKey: options.fetchKey, query });
  void variables;
  if (queryModes[query] === 'error') {
    throw new Error(`${query} failed`);
  }
  return { action: 'ready' };
}

function ShellRecoveryRoute() {
  return createElement(RouteBoundary, {
    children: createElement(ShellRecoveryContent),
    error: (retry) => createElement('Retry', { onPress: retry }),
    loading: createElement('Loading'),
    title: 'Shell failed',
  });
}

function NativeSessionFixture() {
  const actor = useRelayActor();
  const session = useSession();
  useEffect(() => {
    navigationMounts += 1;
    return () => {
      navigationUnmounts += 1;
    };
  }, []);

  return createElement('NativeSession', {
    nativeToken: actor.nativeToken,
    onPress: () => actor.setNativeSession('native-session-token'),
    selectedProfileId: session.selectedProfileId,
    sessionId: session.sessionId,
    status: session.status,
  });
}

function RootRuntimeProbe() {
  if (rootShouldThrow) {
    throw new Error('root runtime failed');
  }
  if (rootShouldSuspend) {
    throw new Promise<void>((resolve) => pendingRootRenders.push(resolve));
  }

  return createElement('RootRuntimeProbe');
}

function ShellUnreadFixture() {
  return createElement(
    UnreadNotificationBadgeController,
    null,
    createElement(ShellRecoveryRoute),
    createElement(BadgeValue),
  );
}

function BadgeValue() {
  const { selectedProfileId } = useSession();
  return createElement('BadgeValue', {
    count: useUnreadNotificationCount(),
    selectedProfileId,
  });
}

function findTag(tag: string) {
  assert.ok(renderer);
  const node = renderer.root.findAll((candidate) => String(candidate.type) === tag)[0];
  assert.ok(node);
  return node;
}

describe('AppProviders runtime composition', () => {
  it('root fallback remounts the complete app runtime after its action', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      await act(async () => {
        renderer = create(createElement(AppProviders, null, createElement(RootRuntimeProbe)));
      });

      assert.equal(relayActorMounts, 1);
      assert.equal(relayActorUnmounts, 0);

      rootShouldThrow = true;
      await act(async () => {
        renderer?.update(createElement(AppProviders, null, createElement(RootRuntimeProbe)));
      });

      assert.equal(renderer?.root.findAll((node) => String(node.type) === 'StateView').length, 1);
      assert.equal(relayActorMounts, 1);
      assert.equal(relayActorUnmounts, 1);

      rootShouldThrow = false;
      const fallback = renderer?.root.findAll((node) => String(node.type) === 'StateView')[0];
      assert.ok(fallback);
      await act(async () => fallback.props.onAction());

      assert.equal(relayActorMounts, 2);
      assert.equal(relayActorUnmounts, 1);
      assert.equal(renderer?.root.findAll((node) => String(node.type) === 'StateView').length, 0);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('root suspense uses the app loading splash for a pending runtime', async () => {
    rootShouldSuspend = true;
    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(RootRuntimeProbe)));
    });

    assert.equal(findTag('Splash').props.label, '앱을 불러오는 중입니다.');

    rootShouldSuspend = false;
    await act(async () => {
      pendingRootRenders.splice(0).forEach((resolve) => resolve());
    });

    assert.equal(renderer?.root.findAll((node) => String(node.type) === 'Splash').length, 0);
    assert.equal(
      renderer?.root.findAll((node) => String(node.type) === 'RootRuntimeProbe').length,
      1,
    );
  });

  it('does not expose the previous profile while a new actor Session query is pending', async () => {
    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(NativeSessionFixture)));
    });

    const initial = findTag('NativeSession');
    assert.deepEqual(
      {
        selectedProfileId: initial.props.selectedProfileId,
        sessionId: initial.props.sessionId,
        status: initial.props.status,
      },
      { selectedProfileId: 'profile-a', sessionId: 'session-1', status: 'valid' },
    );
    queryModes.SessionProviderQuery = 'pending';

    await act(async () => {
      void initial.props.onPress();
      await Promise.resolve();
    });

    const duringTransition = findTag('NativeSession');
    assert.deepEqual(
      {
        nativeToken: duringTransition.props.nativeToken,
        selectedProfileId: duringTransition.props.selectedProfileId,
        sessionId: duringTransition.props.sessionId,
        status: duringTransition.props.status,
      },
      {
        nativeToken: 'native-session-token',
        selectedProfileId: null,
        sessionId: null,
        status: 'error',
      },
    );
    assert.equal(navigationMounts, 1);
    assert.equal(navigationUnmounts, 0);

    queryModes.SessionProviderQuery = 'success';
    await act(async () => {
      pendingSessionQueries.splice(0).forEach((resolve) => resolve());
    });

    const recovered = findTag('NativeSession');
    assert.equal(recovered.props.selectedProfileId, 'profile-a');
    assert.equal(recovered.props.status, 'valid');
    assert.equal(navigationMounts, 1);
    assert.equal(navigationUnmounts, 0);
  });

  it('one route retry reruns only the failed route query', async () => {
    queryModes.SessionProviderQuery = 'success';
    queryModes.ShellRecoveryQuery = 'error';
    currentEnvironment = createEnvironment(null);
    unreadFailure = true;

    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(ShellUnreadFixture)));
    });

    assert.equal(renderer?.root.findAll((node) => String(node.type) === 'Ready').length, 0);
    assert.deepEqual(unreadFetches, ['profile-a']);
    assert.deepEqual(findTag('BadgeValue').props, {
      count: null,
      selectedProfileId: 'profile-a',
    });
    const sessionQueryCountBeforeRetry = queryHistory.filter(
      ({ query }) => query === 'SessionProviderQuery',
    ).length;

    queryModes.SessionProviderQuery = 'success';
    queryModes.ShellRecoveryQuery = 'success';
    currentEnvironment = createEnvironment({ id: 'profile-a', unreadNotificationCount: 7 });
    unreadFailure = false;

    const retry = findTag('Retry');
    await act(async () => retry.props.onPress());

    assert.deepEqual(findTag('Ready').props, { action: 'ready', status: 'valid' });
    assert.equal(
      queryHistory.filter(({ query }) => query === 'SessionProviderQuery').length,
      sessionQueryCountBeforeRetry,
    );
    assert.ok(queryHistory.filter(({ query }) => query === 'ShellRecoveryQuery').length > 1);
    assert.deepEqual(unreadFetches, ['profile-a']);
    assert.deepEqual(findTag('BadgeValue').props, {
      count: null,
      selectedProfileId: 'profile-a',
    });
  });

  it('same-profile unread recovery retains the last successful count when refetch fails', async () => {
    await act(async () => {
      renderer = create(
        createElement(
          AppProviders,
          null,
          createElement(UnreadNotificationBadgeController, null, createElement(BadgeValue)),
        ),
      );
    });

    assert.deepEqual(unreadFetches, ['profile-a']);
    assert.deepEqual(findTag('BadgeValue').props, {
      count: 7,
      selectedProfileId: 'profile-a',
    });
    currentEnvironment = createEnvironment(null);
    unreadFailure = true;

    await act(async () => {
      renderer?.update(
        createElement(
          AppProviders,
          null,
          createElement(UnreadNotificationBadgeController, null, createElement(BadgeValue)),
        ),
      );
    });

    assert.deepEqual(unreadFetches, ['profile-a', 'profile-a']);
    assert.deepEqual(findTag('BadgeValue').props, {
      count: 7,
      selectedProfileId: 'profile-a',
    });
  });
});
