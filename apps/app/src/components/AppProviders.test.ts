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
const platform = { OS: 'web' };
const browserHistoryReplacements: unknown[] = [];
let mockAccountId: string | null = 'account-1';
let mockSelectedProfileId: string | null = 'profile-a';
let mockSessionId: string | null = 'session-1';
let selectedProfileCache: string | null = null;
let selectedProfileDeleteGate: Promise<void> | null = null;
let selectedProfileDeleteCalls = 0;
let selectedProfileReads: Array<string | null> = [];
let selectedProfileWrites: string[] = [];
let failNativeSessionDelete = false;
let nativeSessionDeleteAttempts = 0;
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
  'clearNativeSession' | 'nativeToken' | 'resetActor' | 'setNativeSession'
>;
let useRelayAuthLifecycleKey: () => string;
let useSession: () => {
  accountId: string | null;
  accountName: string | null;
  selectedProfileId: string | null;
  sessionId: string | null;
  status: string;
};
let renderer: ReactTestRenderer | null = null;
let originalFetch: typeof fetch;
let originalWindowDescriptor: PropertyDescriptor | undefined;

type MockBrowserWindow = {
  history: {
    replaceState: (data: unknown, title: string, url?: string | URL | null) => void;
    state: unknown;
  };
  location: { href: string };
};

let browserWindow: MockBrowserWindow;

type MockRelayActorValue = {
  actorLifecycleKey: string;
  authLifecycleKey: string;
  clearNativeSession: () => Promise<void>;
  nativeToken: string | null;
  resetActor: (profileId?: string | null) => void;
  selectedProfileId: string | null;
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
  const [authLifecycleKey, setAuthLifecycleKey] = useState('auth-session');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const setNativeSession = useCallback(async (token: string) => {
    setNativeToken(token);
    setSelectedProfileId(null);
    setAuthLifecycleKey((current) => `${current}:native`);
    setActorLifecycleKey((current) => `${current}:native`);
  }, []);
  const clearNativeSession = useCallback(async () => {
    nativeSessionDeleteAttempts += 1;
    if (failNativeSessionDelete) {
      throw new Error('SecureStore delete failure');
    }
    setNativeToken(null);
    setSelectedProfileId(null);
    setAuthLifecycleKey((current) => `${current}:guest`);
    setActorLifecycleKey((current) => `${current}:guest`);
  }, []);
  const resetActor = useCallback((profileId?: string | null) => {
    setSelectedProfileId(profileId ?? null);
    setActorLifecycleKey((current) => `${current}:profile:${profileId ?? 'session'}`);
  }, []);
  const value = useMemo(
    () => ({
      actorLifecycleKey,
      authLifecycleKey,
      clearNativeSession,
      nativeToken,
      resetActor,
      selectedProfileId,
      setNativeSession,
    }),
    [
      actorLifecycleKey,
      authLifecycleKey,
      clearNativeSession,
      nativeToken,
      resetActor,
      selectedProfileId,
      setNativeSession,
    ],
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

function useMockRelayAuthLifecycleKey(): string {
  return useMockRelayActor().authLifecycleKey;
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
  Platform: platform,
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
              selectedProfile: mockSelectedProfileId ? { id: mockSelectedProfileId } : null,
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
  trackAnalytics: () => undefined,
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
  useRelayAuthLifecycleKey: useMockRelayAuthLifecycleKey,
  useRelayActorLifecycleKey: useMockRelayActorLifecycleKey,
});
mockModule('@/auth/selectedProfileStorage', {
  deleteSelectedProfile: async () => {
    selectedProfileDeleteCalls += 1;
    if (selectedProfileDeleteGate) {
      await selectedProfileDeleteGate;
    }
    selectedProfileCache = null;
  },
  readSelectedProfile: async () => {
    selectedProfileReads.push(selectedProfileCache);
    return selectedProfileCache;
  },
  writeSelectedProfile: async (profileId: string) => {
    selectedProfileWrites.push(profileId);
    selectedProfileCache = profileId;
  },
});

before(async () => {
  originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  ({ AppProviders } = await import('./AppProviders'));
  ({ useFeatureFlag } = await import('./FeatureFlagsContext'));
  ({ UniversalShell } = await import('./shell/UniversalShell'));
  ({ RouteBoundary, useRouteBoundary } = await import('./RouteBoundary'));
  ({ useSession } = await import('../session/SessionProvider'));
  ({ useRelayActor, useRelayAuthLifecycleKey } = await import('../relay/RelayActorProvider'));
});

beforeEach(() => {
  platform.OS = 'web';
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 503 });
  queryModes.SessionProviderQuery = 'success';
  queryModes.ShellRecoveryQuery = 'success';
  queryModes.UniversalShellQuery = 'success';
  mockAccountId = 'account-1';
  mockSelectedProfileId = 'profile-a';
  mockSessionId = 'session-1';
  selectedProfileCache = null;
  selectedProfileDeleteGate = null;
  selectedProfileDeleteCalls = 0;
  selectedProfileReads = [];
  selectedProfileWrites = [];
  browserHistoryReplacements.length = 0;
  browserWindow = {
    history: {
      replaceState(data, title, url) {
        browserHistoryReplacements.push(data);
        this.state = data;
        if (url != null) {
          browserWindow.location.href = new URL(
            String(url),
            browserWindow.location.href,
          ).toString();
        }
      },
      state: { key: 'app-history-entry' },
    },
    location: { href: 'https://kos.moe/home' },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: browserWindow,
    writable: true,
  });
  failNativeSessionDelete = false;
  nativeSessionDeleteAttempts = 0;
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
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
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
    accountId: session.accountId,
    accountName: session.accountName,
    authLifecycleKey: useRelayAuthLifecycleKey(),
    nativeToken: actor.nativeToken,
    onPress: () => actor.setNativeSession('native-session-token'),
    onExpireSession: () => {
      mockAccountId = null;
      mockSelectedProfileId = null;
      mockSessionId = null;
      actor.resetActor(null);
    },
    onProfileSwitch: (profileId: string) => actor.resetActor(profileId),
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
    arbitrary: useFeatureFlag('future-flag-without-a-provider-entry'),
    disabled: useFeatureFlag('disabled'),
    malformed: useFeatureFlag('malformed'),
    errored: useFeatureFlag('errored'),
    missing: useFeatureFlag('missing'),
  });
}

function ProfileLifecycleProbe() {
  const { resetActor } = useRelayActor();
  return createElement('ProfileLifecycleProbe', { resetActor });
}

function FeatureFlagsAccountSwitchProbe() {
  const actor = useRelayActor();
  const session = useSession();

  return createElement('FeatureFlagsAccountSwitchProbe', {
    accountId: session.accountId,
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
  it('clears the cached Web profile before restoring the post-login Session', async () => {
    selectedProfileCache = 'profile-b';
    browserWindow.location.href = 'https://kos.moe/home?from=oidc&resetSelectedProfile=1#feed';
    const historyState = browserWindow.history.state;
    let finishDelete!: () => void;
    selectedProfileDeleteGate = new Promise<void>((resolve) => {
      finishDelete = resolve;
    });

    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(NativeSessionFixture)));
    });

    assert.equal(selectedProfileDeleteCalls, 1);
    assert.equal(selectedProfileCache, 'profile-b');
    assert.deepEqual(
      queryHistory.filter(({ query }) => query === 'SessionProviderQuery'),
      [],
    );
    assert.equal(browserHistoryReplacements.length, 0);

    await act(async () => {
      finishDelete();
      await Promise.resolve();
    });

    assert.equal(selectedProfileDeleteCalls, 1);
    assert.deepEqual(selectedProfileReads, [null]);
    assert.deepEqual(selectedProfileWrites, ['profile-a']);
    assert.equal(selectedProfileCache, 'profile-a');
    assert.ok(queryHistory.some(({ query }) => query === 'SessionProviderQuery'));
    assert.equal(browserHistoryReplacements.length, 1);
    assert.strictEqual(browserHistoryReplacements[0], historyState);
    assert.equal(browserWindow.location.href, 'https://kos.moe/home?from=oidc#feed');
    assert.deepEqual(
      {
        accountId: findTag('NativeSession').props.accountId,
        selectedProfileId: findTag('NativeSession').props.selectedProfileId,
        sessionId: findTag('NativeSession').props.sessionId,
      },
      { accountId: 'account-1', selectedProfileId: 'profile-a', sessionId: 'session-1' },
    );

    await act(async () => {
      renderer?.update(createElement(AppProviders, null, createElement(NativeSessionFixture)));
    });
    assert.equal(selectedProfileDeleteCalls, 1);
    assert.equal(browserHistoryReplacements.length, 1);
  });

  it('preserves the cached Web profile on ordinary startup without the login marker', async () => {
    selectedProfileCache = 'profile-b';
    mockSelectedProfileId = 'profile-b';
    browserWindow.location.href = 'https://kos.moe/home?from=bookmark#feed';

    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(NativeSessionFixture)));
    });

    assert.equal(selectedProfileDeleteCalls, 0);
    assert.deepEqual(selectedProfileReads, ['profile-b']);
    assert.equal(selectedProfileCache, 'profile-b');
    assert.equal(browserHistoryReplacements.length, 0);
    assert.equal(browserWindow.location.href, 'https://kos.moe/home?from=bookmark#feed');
    assert.equal(findTag('NativeSession').props.selectedProfileId, 'profile-b');
  });

  it('uses the app canvas for the Native navigation background', async () => {
    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(NavigationThemeProbe)));
    });

    assert.equal(findTag('NavigationThemeProbe').props.background, '#fff');
  });

  it('keeps one account flag snapshot across profile restoration and selection', async () => {
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
      renderer = create(
        createElement(
          AppProviders,
          null,
          createElement(FeatureFlagsProbe),
          createElement(ProfileLifecycleProbe),
        ),
      );
    });

    assert.deepEqual(findTag('FeatureFlagsProbe').props, {
      quote: false,
      arbitrary: false,
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
      arbitrary: false,
      disabled: false,
      malformed: false,
      errored: false,
      missing: false,
    });
    assert.equal(requests.length, 1);

    mockSelectedProfileId = 'profile-b';
    await act(async () => findTag('ProfileLifecycleProbe').props.resetActor('profile-b'));

    assert.equal(findTag('FeatureFlagsProbe').props.quote, true);
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

  it('enables every flag on dev with and without an account and skips OFREP', async () => {
    const globals = globalThis as typeof globalThis & { __DEV__?: unknown };
    const originalDev = globals.__DEV__;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(null, { status: 503 });
    };
    globals.__DEV__ = true;
    mockAccountId = null;
    mockSessionId = null;

    try {
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

      const flags = () => findTag('FeatureFlagsProbe').props;
      const accountId = () => findTag('FeatureFlagsAccountSwitchProbe').props.accountId;
      assert.equal(accountId(), null);
      assert.deepEqual(flags(), {
        quote: true,
        arbitrary: true,
        disabled: true,
        malformed: true,
        errored: true,
        missing: true,
      });
      assert.equal(fetchCalls, 0);

      const changeAccount = findTag('FeatureFlagsAccountSwitchProbe').props.onAccountChange;
      await act(async () => changeAccount('account-1'));

      assert.equal(accountId(), 'account-1');
      assert.deepEqual(flags(), {
        quote: true,
        arbitrary: true,
        disabled: true,
        malformed: true,
        errored: true,
        missing: true,
      });
      assert.equal(fetchCalls, 0);
    } finally {
      if (originalDev === undefined) {
        delete globals.__DEV__;
      } else {
        globals.__DEV__ = originalDev;
      }
    }
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

  it('clears the previous Session while a new auth Session query is pending', async () => {
    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(NativeSessionFixture)));
    });

    const initial = findTag('NativeSession');
    assert.deepEqual(
      {
        accountId: initial.props.accountId,
        accountName: initial.props.accountName,
        selectedProfileId: initial.props.selectedProfileId,
        sessionId: initial.props.sessionId,
        status: initial.props.status,
      },
      {
        accountId: 'account-1',
        accountName: 'Account',
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
        accountId: duringTransition.props.accountId,
        accountName: duringTransition.props.accountName,
        nativeToken: duringTransition.props.nativeToken,
        selectedProfileId: duringTransition.props.selectedProfileId,
        sessionId: duringTransition.props.sessionId,
        status: duringTransition.props.status,
      },
      {
        accountId: null,
        accountName: null,
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

    queryModes.SessionProviderQuery = 'error';
    await act(async () => recovered.props.onPress());

    const afterAuthQueryError = findTag('NativeSession');
    assert.deepEqual(
      {
        accountId: afterAuthQueryError.props.accountId,
        accountName: afterAuthQueryError.props.accountName,
        selectedProfileId: afterAuthQueryError.props.selectedProfileId,
        sessionId: afterAuthQueryError.props.sessionId,
        status: afterAuthQueryError.props.status,
      },
      {
        accountId: null,
        accountName: null,
        selectedProfileId: null,
        sessionId: null,
        status: 'error',
      },
    );
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

  it('preserves the confirmed Session while a profile-only query is pending or fails', async () => {
    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(NativeSessionFixture)));
    });

    const initial = findTag('NativeSession');
    assert.deepEqual(
      {
        accountId: initial.props.accountId,
        accountName: initial.props.accountName,
        selectedProfileId: initial.props.selectedProfileId,
        sessionId: initial.props.sessionId,
        status: initial.props.status,
      },
      {
        accountId: 'account-1',
        accountName: 'Account',
        selectedProfileId: 'profile-a',
        sessionId: 'session-1',
        status: 'valid',
      },
    );

    queryModes.SessionProviderQuery = 'pending';
    mockSelectedProfileId = 'profile-b';
    await act(async () => {
      initial.props.onProfileSwitch('profile-b');
      await Promise.resolve();
    });

    const duringTransition = findTag('NativeSession');
    assert.deepEqual(
      {
        accountId: duringTransition.props.accountId,
        accountName: duringTransition.props.accountName,
        selectedProfileId: duringTransition.props.selectedProfileId,
        sessionId: duringTransition.props.sessionId,
        status: duringTransition.props.status,
      },
      {
        accountId: 'account-1',
        accountName: 'Account',
        selectedProfileId: null,
        sessionId: 'session-1',
        status: 'valid',
      },
    );
    assert.equal(navigationMounts, 1);
    assert.equal(navigationUnmounts, 0);

    queryModes.SessionProviderQuery = 'success';
    await act(async () => {
      pendingSessionQueries.splice(0).forEach((resolve) => resolve());
    });

    const recovered = findTag('NativeSession');
    assert.deepEqual(
      {
        accountId: recovered.props.accountId,
        accountName: recovered.props.accountName,
        selectedProfileId: recovered.props.selectedProfileId,
        sessionId: recovered.props.sessionId,
        status: recovered.props.status,
      },
      {
        accountId: 'account-1',
        accountName: 'Account',
        selectedProfileId: 'profile-b',
        sessionId: 'session-1',
        status: 'valid',
      },
    );

    queryModes.SessionProviderQuery = 'error';
    await act(async () => findTag('NativeSession').props.onProfileSwitch('profile-c'));

    const afterActorQueryError = findTag('NativeSession');
    assert.deepEqual(
      {
        accountId: afterActorQueryError.props.accountId,
        accountName: afterActorQueryError.props.accountName,
        selectedProfileId: afterActorQueryError.props.selectedProfileId,
        sessionId: afterActorQueryError.props.sessionId,
        status: afterActorQueryError.props.status,
      },
      {
        accountId: 'account-1',
        accountName: 'Account',
        selectedProfileId: null,
        sessionId: 'session-1',
        status: 'valid',
      },
    );
  });

  it('keeps a server-confirmed guest even when native credential deletion fails', async () => {
    platform.OS = 'native';
    await act(async () => {
      renderer = create(createElement(AppProviders, null, createElement(NativeSessionFixture)));
    });
    await act(async () => findTag('NativeSession').props.onPress());

    const beforeGuestQuery = findTag('NativeSession');
    const authLifecycleKey = beforeGuestQuery.props.authLifecycleKey;
    const nativeToken = beforeGuestQuery.props.nativeToken;
    assert.equal(nativeToken, 'native-session-token');

    failNativeSessionDelete = true;
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      await act(async () => findTag('NativeSession').props.onExpireSession());
      await new Promise<void>((resolve) => setImmediate(resolve));

      const guest = findTag('NativeSession');
      assert.deepEqual(
        {
          accountId: guest.props.accountId,
          accountName: guest.props.accountName,
          selectedProfileId: guest.props.selectedProfileId,
          sessionId: guest.props.sessionId,
          status: guest.props.status,
        },
        {
          accountId: null,
          accountName: null,
          selectedProfileId: null,
          sessionId: null,
          status: 'guest',
        },
      );
      assert.equal(guest.props.nativeToken, nativeToken);
      assert.equal(guest.props.authLifecycleKey, authLifecycleKey);
      assert.equal(nativeSessionDeleteAttempts, 1);
      assert.deepEqual(unhandledRejections, []);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});
