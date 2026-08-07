import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type QueryName = 'SessionProviderQuery' | 'ShellRecoveryQuery';
type QueryMode = 'error' | 'success';

const queryModes: Record<QueryName, QueryMode> = {
  SessionProviderQuery: 'success',
  ShellRecoveryQuery: 'success',
};
const queryHistory: Array<{ fetchKey: unknown; query: QueryName }> = [];
const unreadFetches: string[] = [];
let currentEnvironment: FakeEnvironment;
let unreadFailure = false;
let useSession: () => { selectedProfileId: string | null; status: string };
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
let UnreadNotificationBadgeController: ComponentType<PropsWithChildren>;
let renderer: ReactTestRenderer | null = null;

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

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', { Platform: { OS: 'web' } });
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
  RelayActorProvider: ({ children }: PropsWithChildren) => children,
  useRelayActor: () => ({ clearNativeSession: async () => undefined, nativeToken: null }),
});

before(async () => {
  ({ AppProviders } = await import('./AppProviders'));
  ({ RouteBoundary, useRouteBoundary } = await import('./RouteBoundary'));
  ({ useSessionRecovery } = await import('../session/SessionRecoveryCoordinator'));
  ({ useSession } = await import('../session/SessionProvider'));
  ({ UnreadNotificationBadgeController, useUnreadNotificationCount } =
    await import('./shell/UnreadNotificationBadgeController'));
});

beforeEach(() => {
  queryModes.SessionProviderQuery = 'success';
  queryModes.ShellRecoveryQuery = 'success';
  queryHistory.length = 0;
  unreadFetches.length = 0;
  unreadFailure = false;
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
