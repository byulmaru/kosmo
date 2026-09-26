import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const require = createRequire(import.meta.url);

const platform = { OS: 'ios' };
let activeProfileId = 'profile-a';
let renderer: ReactTestRenderer | null = null;
let HomeTimelineScreen: ComponentType;
let LocalTimelineScreen: ComponentType;

const homeRequests: Array<{
  complete?: () => void;
  error?: (error: Error) => void;
}> = [];
const localRefetchRequests: Array<{
  onComplete?: (error: Error | null) => void;
}> = [];
const toasts: Array<{
  message: string;
  options: {
    action?: { label: string; onPress: () => void };
  };
}> = [];
let toastCleanupCount = 0;

const environment = {
  check: () => ({ status: 'missing' }),
  retain: () => ({ dispose: () => undefined }),
};

function MockPostList({ identityKey }: { identityKey?: string }) {
  return createElement('TimelineRows', { identityKey });
}

function localData() {
  return {
    currentSession: {
      id: 'session',
      selectedProfile: { id: activeProfileId },
    },
    me: { id: 'me', profiles: [{ id: activeProfileId }] },
  };
}

const homeData = {
  currentSession: { id: 'session', selectedProfile: { id: 'profile-a' } },
  me: { id: 'me', name: 'Me', profiles: [{ id: 'profile-a' }] },
};

const localRefetch = (
  _variables: object,
  options: { onComplete?: (error: Error | null) => void },
) => {
  localRefetchRequests.push(options);
};

const showToast = (message: string, options: (typeof toasts)[number]['options']) => {
  toasts.push({ message, options });
  return () => {
    toastCleanupCount += 1;
  };
};

mockModule('lucide-react-native', { UserRoundPlus: 'UserRoundPlus' });
mockModule(require.resolve('lucide-react-native'), { UserRoundPlus: 'UserRoundPlus' });
mockModule('react-native', {
  Platform: platform,
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ width: 390 }),
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, data: unknown) => data,
  useLazyLoadQuery: (_query: unknown, _variables: object, options: { fetchPolicy: string }) =>
    options.fetchPolicy === 'store-or-network' ? homeData : localData(),
  useRefetchableFragment: () => [null, localRefetch],
  useRelayEnvironment: () => environment,
});
mockModule('relay-runtime', {
  createOperationDescriptor: () => ({}),
  fetchQuery: () => ({
    subscribe: (observer: { complete?: () => void; error?: (error: Error) => void }) => {
      homeRequests.push(observer);
      return { unsubscribe: () => undefined };
    },
  }),
  getRequest: () => ({}),
});
mockModule('@/components/PageHeader', { PageHeader: () => null });
mockModule('@/components/post/PostList', { PostList: MockPostList });
mockModule('@/observability/UnexpectedErrorContext', {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule('@/relay/RelayActorProvider', {
  useRelayActorLifecycleKey: () => 'actor',
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children }: { children: ReactNode }) => children,
  useRouteBoundary: () => ({ fetchKey: 0, refetch: () => undefined }),
});
mockModule('@/components/shell/ShellChromeContext', { useShellChrome: () => null });
mockModule('@/components/shell/shellLayout', {
  getShellLayout: () => 'mobile',
  getWebMobileShellHeaderStickyOffset: () => 0,
});
mockModule('@/components/TimelineTabs', { TimelineTabs: () => null });
mockModule('@/components/ui/Button', { Button: () => null });
mockModule('@/components/ui/StateView', { Skeleton: () => null, StateView: () => null });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ text: '#111', textSecondary: '#777' }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  space: { 8: 8, 16: 16 },
  spacing: { lg: 16, sm: 8, xl: 24 },
  typography: { md: {}, sm: {} },
});

before(async () => {
  ({ default: HomeTimelineScreen } = await import('./HomeTimelineScreen'));
  ({ default: LocalTimelineScreen } = await import('./LocalTimelineScreen'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  homeRequests.length = 0;
  localRefetchRequests.length = 0;
  toasts.length = 0;
  toastCleanupCount = 0;
  activeProfileId = 'profile-a';
  platform.OS = 'ios';
});

describe('Native timeline refresh', () => {
  it('Home refresh owner는 pending 중 중복을 막고 실패 retry를 연결한다', async () => {
    await act(async () => {
      renderer = create(createElement(HomeTimelineScreen));
    });

    let postList = renderer?.root.findByType(MockPostList);
    assert.equal(postList?.props.refreshing, false);

    await act(async () => {
      postList?.props.onRefresh();
      postList?.props.onRefresh();
    });

    assert.equal(homeRequests.length, 1);
    postList = renderer?.root.findByType(MockPostList);
    assert.equal(postList?.props.refreshing, true);

    await act(async () => homeRequests[0]?.error?.(new Error('network')));

    assert.equal(renderer?.root.findAllByType(MockPostList).length, 1);
    assert.equal(renderer?.root.findByType(MockPostList).props.refreshing, false);
    assert.equal(toasts.at(-1)?.options.action?.label, '다시 시도');

    await act(async () => toasts.at(-1)?.options.action?.onPress());
    assert.equal(homeRequests.length, 2);
    assert.equal(renderer?.root.findByType(MockPostList).props.refreshing, true);

    await act(async () => homeRequests[1]?.complete?.());
    assert.equal(renderer?.root.findByType(MockPostList).props.refreshing, false);
    assert.equal(toastCleanupCount, 1);
  });

  it('Local refresh owner는 실패 retry 중에도 목록 owner와 profile identity를 유지한다', async () => {
    await act(async () => {
      renderer = create(createElement(LocalTimelineScreen));
    });

    const postList = renderer?.root.findByType(MockPostList);
    assert.equal(postList?.props.identityKey, 'local:profile-a');

    await act(async () => {
      postList?.props.onRefresh();
      postList?.props.onRefresh();
    });

    assert.equal(localRefetchRequests.length, 1);
    assert.equal(renderer?.root.findByType(MockPostList).props.refreshing, true);

    await act(async () => localRefetchRequests[0]?.onComplete?.(new Error('network')));

    assert.equal(renderer?.root.findAllByType(MockPostList).length, 1);
    assert.equal(renderer?.root.findByType(MockPostList).props.refreshing, false);
    assert.equal(toasts.at(-1)?.options.action?.label, '다시 시도');

    await act(async () => toasts.at(-1)?.options.action?.onPress());
    assert.equal(localRefetchRequests.length, 2);

    activeProfileId = 'profile-b';
    await act(async () => renderer?.update(createElement(LocalTimelineScreen)));
    assert.equal(renderer?.root.findByType(MockPostList).props.identityKey, 'local:profile-b');
  });
});
