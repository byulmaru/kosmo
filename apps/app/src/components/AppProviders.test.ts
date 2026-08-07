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
const unreadFetches: string[] = [];
const routeReplaces: string[] = [];
let currentEnvironment: FakeEnvironment;
let unreadFailure = false;
let navigationMounts = 0;
let navigationUnmounts = 0;
let useSession: () => {
  selectedProfileId: string | null;
  sessionId: string | null;
  status: string;
};
let useRelayActor: () => Pick<MockRelayActorValue, 'nativeToken' | 'setNativeSession'>;
let useUnreadNotificationCount: () => number | null;
let useSessionRecovery: () => () => void;
let RouteBoundary: ComponentType<{
  children: ReactNode;
  error?: (retry: () => void) => ReactNode;
  loading: ReactNode;
  onRetry?: () => void;
  title: string;
}>;
let useRouteBoundary: () => { fetchKey: number };
let AppProviders: ComponentType<PropsWithChildren>;
let ProtectedLayout: ComponentType;
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

type FakeSnapshot = { data: { node: { id: string; unreadNotificationCount: number } | null } };
type FakeEnvironment = {
  lookup: () => FakeSnapshot;
  retain: () => { dispose: () => void };
  subscribe: (
    _snapshot: FakeSnapshot,
    _callback: (snapshot: FakeSnapshot) => void,
  ) => {
    dispose: () => void;
  };
};

function MockRelayActorProvider({ children }: PropsWithChildren) {
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
  useRouter: () => ({ replace: (path: string) => routeReplaces.push(path) }),
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
mockModule(new URL('../components/GraphQLErrorBoundary.tsx', import.meta.url), {
  GraphQLErrorBoundary: ({ children }: PropsWithChildren) => children,
});
mockModule(new URL('../components/Splash.tsx', import.meta.url), { Splash: () => null });
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
  ({ default: ProtectedLayout } = await import('../app/(tabs)/(protected)/_layout'));
  ({ RouteBoundary, useRouteBoundary } = await import('./RouteBoundary'));
  ({ useSessionRecovery } = await import('../session/SessionRecoveryCoordinator'));
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
  routeReplaces.length = 0;
  unreadFailure = false;
  navigationMounts = 0;
  navigationUnmounts = 0;
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
  return queryModes[query] === 'error'
    ? (() => {
        queryHistory.push({ fetchKey: options.fetchKey, query });
        throw new Error(`${query} failed`);
      })()
    : (() => {
        queryHistory.push({ fetchKey: options.fetchKey, query });
        void variables;
        return { action: 'ready' };
      })();
}

function ShellRecoveryRoute() {
  const recoverSession = useSessionRecovery();
  return createElement(RouteBoundary, {
    children: createElement(ShellRecoveryContent),
    error: (retry) => createElement('Retry', { onPress: retry }),
    loading: createElement('Loading'),
    onRetry: recoverSession,
    title: 'Shell failed',
  });
}

function NativeSessionRecoveryFixture() {
  const actor = useRelayActor();
  const session = useSession();
  useEffect(() => {
    navigationMounts += 1;
    return () => {
      navigationUnmounts += 1;
    };
  }, []);

  return createElement('NativeSessionRecovery', {
    nativeToken: actor.nativeToken,
    onPress: () => actor.setNativeSession('native-session-token'),
    sessionId: session.sessionId,
    selectedProfileId: session.selectedProfileId,
    status: session.status,
  });
}

function NativeAndProtectedSessionFixture() {
  return createElement(
    'NavigationSurface',
    null,
    createElement(ProtectedLayout),
    createElement(NativeSessionRecoveryFixture),
  );
}

function ShellUnreadRecoveryFixture() {
  return createElement(
    UnreadNotificationBadgeController,
    null,
    createElement(ShellRecoveryRoute),
    createElement(BadgeValue),
  );
}

function UnreadBadgeFixture({ version }: { version: number }) {
  void version;
  return createElement(UnreadNotificationBadgeController, null, createElement(BadgeValue));
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

describe('AppProviders Session recovery composition', () => {
  it('does not expose the previous profile while a new actor Session query is pending', async () => {
    await act(async () => {
      renderer = create(
        createElement(AppProviders, null, createElement(NativeAndProtectedSessionFixture)),
      );
    });

    const initial = findTag('NativeSessionRecovery');
    assert.equal(initial.props.selectedProfileId, 'profile-a');
    queryModes.SessionProviderQuery = 'pending';

    await act(async () => {
      void initial.props.onPress();
      await Promise.resolve();
    });

    const duringTransition = findTag('NativeSessionRecovery');
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
    assert.deepEqual(routeReplaces, []);

    queryModes.SessionProviderQuery = 'success';
    await act(async () => {
      pendingSessionQueries.splice(0).forEach((resolve) => resolve());
    });

    const recovered = findTag('NativeSessionRecovery');
    assert.equal(recovered.props.selectedProfileId, 'profile-a');
    assert.equal(recovered.props.status, 'valid');
    assert.equal(navigationMounts, 1);
    assert.equal(navigationUnmounts, 0);
    assert.deepEqual(routeReplaces, []);
  });

  it('initial SessionProviderQuery failure recovers after native actor lifecycle transition', async () => {
    queryModes.SessionProviderQuery = 'error';
    const previousEnvironment = currentEnvironment;

    await act(async () => {
      renderer = create(
        createElement(AppProviders, null, createElement(NativeSessionRecoveryFixture)),
      );
    });

    const initial = findTag('NativeSessionRecovery');
    assert.deepEqual(
      {
        nativeToken: initial.props.nativeToken,
        sessionId: initial.props.sessionId,
        status: initial.props.status,
      },
      { nativeToken: null, sessionId: null, status: 'error' },
    );
    queryModes.SessionProviderQuery = 'success';

    await act(async () => initial.props.onPress());

    const recovered = findTag('NativeSessionRecovery');
    assert.deepEqual(
      {
        nativeToken: recovered.props.nativeToken,
        sessionId: recovered.props.sessionId,
        status: recovered.props.status,
      },
      { nativeToken: 'native-session-token', sessionId: 'session-1', status: 'valid' },
    );
    assert.notEqual(currentEnvironment, previousEnvironment);
    assert.equal(navigationMounts, 1);
    assert.equal(navigationUnmounts, 0);
    const sessionQueries = queryHistory.filter(({ query }) => query === 'SessionProviderQuery');
    assert.ok(sessionQueries.length > 1);
    assert.equal(sessionQueries.at(-1)?.fetchKey, 0);
  });

  it('one Shell retry initiates Session recovery and recovers shell actions after simultaneous failures', async () => {
    queryModes.SessionProviderQuery = 'error';
    queryModes.ShellRecoveryQuery = 'error';

    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(ShellRecoveryRoute)));
    });

    assert.ok(renderer);
    assert.equal(renderer.root.findAll((node) => String(node.type) === 'Ready').length, 0);
    const retry = findTag('Retry');
    queryModes.SessionProviderQuery = 'success';
    queryModes.ShellRecoveryQuery = 'success';

    await act(async () => retry.props.onPress());

    const ready = findTag('Ready');
    assert.deepEqual(ready.props, { action: 'ready', status: 'valid' });
    const sessionQueries = queryHistory.filter(({ query }) => query === 'SessionProviderQuery');
    assert.ok(sessionQueries.length > 1);
    assert.equal(sessionQueries.at(-1)?.fetchKey, 1);
    assert.ok(queryHistory.filter(({ query }) => query === 'ShellRecoveryQuery').length > 1);
  });

  it('Session recovery initiated by Shell retry re-runs the unread controller after its first count fetch fails', async () => {
    queryModes.ShellRecoveryQuery = 'error';
    currentEnvironment = createEnvironment(null);
    unreadFailure = true;

    await act(async () => {
      renderer = create(
        createElement(AppProviders, null, createElement(ShellUnreadRecoveryFixture)),
      );
    });

    assert.deepEqual(unreadFetches, ['profile-a']);
    assert.deepEqual(findTag('BadgeValue').props, {
      count: null,
      selectedProfileId: 'profile-a',
    });
    queryModes.ShellRecoveryQuery = 'success';
    currentEnvironment = createEnvironment({ id: 'profile-a', unreadNotificationCount: 7 });
    unreadFailure = false;

    const retry = findTag('Retry');
    await act(async () => retry.props.onPress());

    assert.deepEqual(unreadFetches, ['profile-a', 'profile-a']);
    assert.deepEqual(findTag('BadgeValue').props, {
      count: 7,
      selectedProfileId: 'profile-a',
    });
  });

  it('same Profile actor reset keeps the last unread count when the refetch fails', async () => {
    await act(async () => {
      renderer = create(
        createElement(AppProviders, null, createElement(UnreadBadgeFixture, { version: 1 })),
      );
    });

    assert.deepEqual(unreadFetches, ['profile-a']);
    const initialRenderer = renderer;
    assert.ok(initialRenderer);
    assert.deepEqual(findTag('BadgeValue').props, {
      count: 7,
      selectedProfileId: 'profile-a',
    });
    currentEnvironment = createEnvironment(null);
    unreadFailure = true;

    await act(async () => {
      renderer?.update(
        createElement(AppProviders, null, createElement(UnreadBadgeFixture, { version: 2 })),
      );
    });

    assert.deepEqual(findTag('BadgeValue').props, {
      count: 7,
      selectedProfileId: 'profile-a',
    });
    assert.deepEqual(unreadFetches, ['profile-a', 'profile-a']);
  });
});
