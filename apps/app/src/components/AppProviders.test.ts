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

type QueryName = 'SessionProviderQuery' | 'ShellRecoveryQuery' | 'UniversalShellQuery';
type QueryMode = 'error' | 'pending' | 'success';
type OfrepRequest = { body: unknown; contentType: string | null; method: string; url: string };

const flagEvaluationUrl = 'https://flags.kos.moe/ofrep/v1/evaluate/flags';

const queryModes: Record<QueryName, QueryMode> = {
  SessionProviderQuery: 'success',
  ShellRecoveryQuery: 'success',
  UniversalShellQuery: 'success',
};
const queryHistory: Array<{ fetchKey: unknown; query: QueryName }> = [];
const pendingSessionQueries: Array<() => void> = [];
const pendingRootRenders: Array<() => void> = [];
let mockAccountId: string | null = 'account-1';
let mockSessionId: string | null = 'session-1';
let navigationMounts = 0;
let navigationUnmounts = 0;
let relayActorMounts = 0;
let relayActorUnmounts = 0;
let rootShouldThrow = false;
let rootShouldSuspend = false;
let AppProviders: ComponentType<PropsWithChildren>;
let useFeatureFlag: (key: string) => boolean;
let UniversalShell: ComponentType;
let RouteBoundary: ComponentType<{
  children: ReactNode;
  error?: (retry: () => void) => ReactNode;
  loading: ReactNode;
  title: string;
}>;
let useRouteBoundary: () => { fetchKey: number };
let useRelayActor: () => Pick<
  MockRelayActorValue,
  'clearNativeSession' | 'nativeToken' | 'setNativeSession'
>;
let useSession: () => {
  selectedProfileId: string | null;
  sessionId: string | null;
  status: string;
};
let renderer: ReactTestRenderer | null = null;
let originalFetch: typeof fetch;

type MockRelayActorValue = {
  actorLifecycleKey: string;
  clearNativeSession: () => Promise<void>;
  nativeToken: string | null;
  resetActor: (profileId?: string | null) => void;
  setNativeSession: (token: string) => Promise<void>;
};

const MockRelayActorContext = createContext<MockRelayActorValue | null>(null);
const MockNavigationThemeContext = createContext({
  colors: { background: 'rgb(242, 242, 242)' },
});
const mockDefaultNavigationTheme = {
  colors: { background: 'rgb(242, 242, 242)' },
  dark: false,
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

function MockRelayActorBoundary({ children }: PropsWithChildren) {
  const { actorLifecycleKey } = useMockRelayActor();

  return createElement(
    MockRelayActorBoundaryContent,
    { actorLifecycleKey, key: actorLifecycleKey },
    children,
  );
}

function MockRelayActorBoundaryContent({
  actorLifecycleKey,
  children,
}: PropsWithChildren<{ actorLifecycleKey: string }>) {
  return createElement('RelayActorBoundary', { actorLifecycleKey }, children);
}

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Modal: 'Modal',
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ height: 900, width: 1024 }),
  View: 'View',
});
mockModule('@react-native-async-storage/async-storage', {
  default: { getItem: async () => null, setItem: async () => undefined },
});
mockModule('expo-router', {
  DefaultTheme: mockDefaultNavigationTheme,
  ThemeProvider: ({
    children,
    value,
  }: PropsWithChildren<{ value: typeof mockDefaultNavigationTheme }>) =>
    createElement(MockNavigationThemeContext.Provider, { value }, children),
  useTheme: () => useContext(MockNavigationThemeContext),
  usePathname: () => '/home',
  useRouter: () => ({ dismissTo: () => undefined, replace: () => undefined }),
  useSegments: () => [],
});
mockModule(require.resolve('lucide-react-native'), {
  ChevronLeftIcon: () => null,
  Menu: () => null,
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    const query = parts.join('').match(/query (\w+)/)?.[1];
    assert.ok(query);
    return query as QueryName;
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
        currentSession: mockSessionId
          ? {
              id: mockSessionId,
              selectedProfile: { id: 'profile-a' },
            }
          : null,
        me: mockAccountId ? { id: mockAccountId, name: 'Account' } : null,
      };
    }
    return { action: 'ready' };
  },
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
mockModule('@/components/feedback/FeedbackOverlay', {
  FeedbackOverlay: () => null,
});
mockModule('@/components/content-report/ContentReportContext', {
  ContentReportProvider: ({ children }: PropsWithChildren) => children,
});
mockModule('@/components/notification/NotificationReadAllContext', {
  NotificationReadAllAction: () => null,
  NotificationReadAllProvider: ({ children }: PropsWithChildren) => children,
});
mockModule('@/components/PageHeader', {
  PageHeader: () => null,
});
mockModule('@/components/post/PostMediaViewerHost', {
  PostMediaViewerScreenFallbackProvider: ({ children }: PropsWithChildren) => children,
});
mockModule('@/components/ui/IconButton', {
  IconButton: () => null,
});
mockModule('@/components/ui/useSafeAreaPadding', {
  useSafeAreaPadding: () => ({}),
});
mockModule(new URL('../components/Splash.tsx', import.meta.url), {
  Splash: ({ label }: { label?: string }) => createElement('Splash', { label }),
});
mockModule(new URL('../components/ui/StateView.tsx', import.meta.url), {
  StateView: ({ onAction, title }: { onAction?: () => void; title: string }) =>
    createElement('StateView', { onAction, title }),
});
mockModule(new URL('../theme/ThemeProvider.tsx', import.meta.url), {
  useElevation: () => ({ overlay: {} }),
  useTheme: () => ({
    backgroundCanvas: '#fff',
    backgroundElevated: '#fff',
    borderSubtle: '#ddd',
    foregroundPrimary: '#111',
    overlayScrim: '#0008',
  }),
  useThemeMode: () => 'light',
  ThemeProvider: ({ children }: PropsWithChildren) => children,
});
mockModule(new URL('../components/ui/ToastProvider.tsx', import.meta.url), {
  ToastProvider: ({ children }: PropsWithChildren) => children,
  useToast: () => ({ showToast: () => undefined }),
});
mockModule(new URL('./shell/BottomTabBar.tsx', import.meta.url), {
  BottomTabBar: () => null,
});
mockModule(new URL('./shell/NavigationGuardContext.tsx', import.meta.url), {
  NavigationGuardProvider: ({ children }: PropsWithChildren) => children,
});
mockModule(new URL('./shell/PrimaryNavigationScrollContext.tsx', import.meta.url), {
  PrimaryNavigationScrollProvider: ({ children }: PropsWithChildren) => children,
  PrimaryNavigationScrollReset: () => null,
});
mockModule(new URL('./shell/RightRail.tsx', import.meta.url), {
  RightRail: () => null,
  RightRailFooter: () => null,
});
mockModule(new URL('./shell/SidebarNavigation.tsx', import.meta.url), {
  SidebarNavigation: () => null,
});
mockModule(new URL('./shell/ShellChromeContext.tsx', import.meta.url), {
  ShellChromeProvider: ({ children }: PropsWithChildren) => children,
});
mockModule(new URL('./shell/shellLayout.ts', import.meta.url), {
  getShellRoutePresentation: () => ({
    layout: 'full',
    settingsWorkspace: false,
    showRightRail: false,
  }),
  getWebMobileShellHeader: () => null,
  isSettingsRoute: () => false,
  isTimelineRoute: () => true,
  isWebMobileRouteOwnedHeader: () => false,
  webMobileShellHeaderHeight: 0,
});
mockModule(new URL('../relay/RelayActorProvider.tsx', import.meta.url), {
  RelayActorBoundary: MockRelayActorBoundary,
  RelayActorProvider: MockRelayActorProvider,
  useRelayActor: useMockRelayActor,
  useRelayActorLifecycleKey: useMockRelayActorLifecycleKey,
});

before(async () => {
  ({ AppProviders } = await import('./AppProviders'));
  ({ useFeatureFlag } = await import('./FeatureFlagsContext'));
  ({ UniversalShell } = await import('./shell/UniversalShell'));
  ({ RouteBoundary, useRouteBoundary } = await import('./RouteBoundary'));
  ({ useSession } = await import('../session/SessionProvider'));
  ({ useRelayActor } = await import('../relay/RelayActorProvider'));
});

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 503 });
  queryModes.SessionProviderQuery = 'success';
  queryModes.ShellRecoveryQuery = 'success';
  queryModes.UniversalShellQuery = 'success';
  mockAccountId = 'account-1';
  mockSessionId = 'session-1';
  queryHistory.length = 0;
  pendingSessionQueries.length = 0;
  navigationMounts = 0;
  navigationUnmounts = 0;
  relayActorMounts = 0;
  relayActorUnmounts = 0;
  rootShouldThrow = false;
  rootShouldSuspend = false;
  pendingRootRenders.length = 0;
});

afterEach(async () => {
  try {
    if (renderer) {
      await act(async () => renderer?.unmount());
      renderer = null;
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

function NavigationThemeProbe() {
  const navigationTheme = useContext(MockNavigationThemeContext);
  return createElement('NavigationThemeProbe', {
    background: navigationTheme.colors.background,
  });
}

function FeatureFlagsProbe() {
  return createElement('FeatureFlagsProbe', {
    quote: useFeatureFlag('quote'),
    disabled: useFeatureFlag('disabled'),
    malformed: useFeatureFlag('malformed'),
    errored: useFeatureFlag('errored'),
    missing: useFeatureFlag('missing'),
  });
}

function FeatureFlagsAccountSwitchProbe() {
  const actor = useRelayActor();

  return createElement('FeatureFlagsAccountSwitchProbe', {
    onAccountChange: async (accountId: string | null) => {
      mockAccountId = accountId;
      mockSessionId = accountId ? `session-${accountId}` : null;
      if (accountId) {
        await actor.setNativeSession(`token-${accountId}`);
      } else {
        await actor.clearNativeSession();
      }
    },
  });
}

async function captureOfrepRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<OfrepRequest> {
  const request = input instanceof Request ? input : new Request(input, init);
  return {
    body: await request.clone().json(),
    contentType: request.headers.get('content-type')?.split(';', 1)[0]?.trim() ?? null,
    method: request.method,
    url: request.url,
  };
}

function assertFlagRequest(request: OfrepRequest, targetingKey: string) {
  assert.deepEqual(request, {
    body: { context: { targetingKey } },
    contentType: 'application/json',
    method: 'POST',
    url: flagEvaluationUrl,
  });
}

function flagsResponse(flags: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify({ flags }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function findTag(tag: string) {
  assert.ok(renderer);
  const node = renderer.root.findAll((candidate) => String(candidate.type) === tag)[0];
  assert.ok(node);
  return node;
}

function findByTestId(testID: string) {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
}

describe('AppProviders runtime composition', () => {
  it('uses the app canvas for the Native navigation background', async () => {
    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(NavigationThemeProbe)));
    });

    assert.equal(findTag('NavigationThemeProbe').props.background, '#fff');
  });

  it('loads one shared flag snapshot per provider mount and fails closed', async () => {
    const requests: OfrepRequest[] = [];
    const pendingRequests: Array<(response: Response) => void> = [];
    globalThis.fetch = async (input) => {
      requests.push(await captureOfrepRequest(input));

      if (requests.length === 1) {
        return new Promise<Response>((resolve) => pendingRequests.push(resolve));
      }
      return new Response(null, { status: 503 });
    };

    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(FeatureFlagsProbe)));
    });

    assert.deepEqual(findTag('FeatureFlagsProbe').props, {
      quote: false,
      disabled: false,
      malformed: false,
      errored: false,
      missing: false,
    });
    assert.equal(requests.length, 1);
    assertFlagRequest(requests[0]!, 'account-1');
    const resolveFirstRequest = pendingRequests.shift();
    assert.ok(resolveFirstRequest);

    await act(async () => {
      resolveFirstRequest(
        flagsResponse([
          { key: 'quote', value: true },
          { key: 'disabled', value: false },
          { key: 'malformed', value: 'true' },
          { key: 'errored', errorCode: 'FLAG_NOT_FOUND' },
        ]),
      );
    });

    assert.deepEqual(findTag('FeatureFlagsProbe').props, {
      quote: true,
      disabled: false,
      malformed: false,
      errored: false,
      missing: false,
    });
    assert.equal(requests.length, 1);

    await act(async () => renderer?.unmount());
    renderer = null;

    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(FeatureFlagsProbe)));
    });

    assert.equal(findTag('FeatureFlagsProbe').props.quote, false);
    assert.equal(findTag('FeatureFlagsProbe').props.disabled, false);
    assert.equal(requests.length, 2);
    assertFlagRequest(requests[1]!, 'account-1');
  });

  it('targets flags to the active account, ignores obsolete results, and resets after logout', async () => {
    const requests: OfrepRequest[] = [];
    const pendingRequests: Array<(response: Response) => void> = [];
    globalThis.fetch = async (input) => {
      requests.push(await captureOfrepRequest(input));
      return new Promise<Response>((resolve) => pendingRequests.push(resolve));
    };
    mockAccountId = null;
    mockSessionId = null;

    await act(async () => {
      renderer = create(
        createElement(
          AppProviders,
          null,
          createElement(
            'FlagTestRoot',
            null,
            createElement(FeatureFlagsProbe),
            createElement(FeatureFlagsAccountSwitchProbe),
          ),
        ),
      );
    });

    const quote = () => findTag('FeatureFlagsProbe').props.quote;
    const changeAccount = findTag('FeatureFlagsAccountSwitchProbe').props.onAccountChange;
    const respond = async (index: number, response: Response) => {
      const resolve = pendingRequests[index];
      assert.ok(resolve);
      await act(async () => resolve(response));
    };
    const flagResponse = (value: boolean) => flagsResponse([{ key: 'quote', value }]);

    assert.equal(quote(), false);
    assert.equal(pendingRequests.length, 0);

    assert.equal(typeof changeAccount, 'function');

    await act(async () => changeAccount('account-1'));
    await respond(0, flagResponse(true));
    assert.equal(quote(), true);

    await act(async () => changeAccount(null));
    assert.equal(pendingRequests.length, 1);
    assert.equal(quote(), false);

    await act(async () => changeAccount('account-1'));
    assert.equal(quote(), false);
    await act(async () => changeAccount('account-2'));
    assert.equal(quote(), false);
    await respond(2, flagResponse(true));
    assert.equal(quote(), true);
    await respond(1, flagResponse(false));
    assert.equal(quote(), true);

    await act(async () => changeAccount(null));
    assert.equal(pendingRequests.length, 3);
    assert.equal(quote(), false);

    await act(async () => changeAccount('account-1'));
    assert.equal(quote(), false);
    await respond(3, new Response(null, { status: 503 }));
    assert.equal(quote(), false);
    const targetingKeys = ['account-1', 'account-1', 'account-2', 'account-1'];
    assert.equal(requests.length, targetingKeys.length);
    for (const [index, targetingKey] of targetingKeys.entries()) {
      assertFlagRequest(requests[index]!, targetingKey);
    }
  });

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
      {
        selectedProfileId: 'profile-a',
        sessionId: 'session-1',
        status: 'valid',
      },
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

    await act(async () => {
      renderer = create(
        createElement(
          AppProviders,
          null,
          createElement(UniversalShell, null, createElement(ShellRecoveryRoute)),
        ),
      );
    });

    assert.equal(renderer?.root.findAll((node) => String(node.type) === 'Ready').length, 0);
    const actorBoundary = findTag('RelayActorBoundary');
    assert.ok(actorBoundary.findAll((node) => String(node.type) === 'Retry').length > 0);
    assert.ok(queryHistory.some(({ query }) => query === 'UniversalShellQuery'));
    const shellRoot = findByTestId('universal-shell-root');
    const sessionQueryCountBeforeRetry = queryHistory.filter(
      ({ query }) => query === 'SessionProviderQuery',
    ).length;
    const shellQueryCountBeforeRetry = queryHistory.filter(
      ({ query }) => query === 'UniversalShellQuery',
    ).length;

    queryModes.SessionProviderQuery = 'success';
    queryModes.ShellRecoveryQuery = 'success';

    const retry = findTag('Retry');
    await act(async () => retry.props.onPress());

    assert.deepEqual(findTag('Ready').props, { action: 'ready', status: 'valid' });
    assert.equal(
      queryHistory.filter(({ query }) => query === 'SessionProviderQuery').length,
      sessionQueryCountBeforeRetry,
    );
    assert.equal(
      queryHistory.filter(({ query }) => query === 'UniversalShellQuery').length,
      shellQueryCountBeforeRetry,
    );
    assert.strictEqual(findByTestId('universal-shell-root'), shellRoot);
    assert.ok(queryHistory.filter(({ query }) => query === 'ShellRecoveryQuery').length > 1);
  });
});
