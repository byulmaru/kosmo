import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);

type QueryMode = 'error' | 'loading' | 'success';

const pending = new Promise<never>(() => undefined);
const queryHistory: Array<{ fetchKey: string }> = [];
let queryMode: QueryMode = 'success';
let renderer: ReactTestRenderer | null = null;
let selectedProfileId: string | null = 'profile-a';
let toastCleanupCount = 0;
let latestToastAction: (() => void) | null = null;
let latestToast: {
  actionLabel?: string;
  message: string;
  persistent?: boolean;
  tone?: string;
} | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const openNavigationDrawer = mock.fn();
mockModule('react-native', {
  Platform: { OS: 'web' },
  View: 'View',
  StyleSheet: { create: (styles: object) => styles },
  useWindowDimensions: () => ({ width: 390 }),
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
});
mockModule('lucide-react-native', { Menu: 'Menu' });
mockModule(require.resolve('lucide-react-native'), { Menu: 'Menu' });
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: PropsWithChildren) =>
    createElement('Pressable', props, children),
});
mockModule('@/components/shell/ShellChromeContext', {
  useShellChrome: () => ({ openNavigationDrawer, navigationDrawerOpen: false }),
});
mockModule('@/theme/ThemeProvider', { useTheme: () => ({ backgroundCanvas: '#fff' }) });

mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    assert.match(parts.join(''), /query FollowRequestsPageQuery/);
    return 'FollowRequestsPageQuery';
  },
  useLazyLoadQuery: (
    query: string,
    variables: Record<string, never>,
    options: { fetchKey: string },
  ) => {
    assert.equal(query, 'FollowRequestsPageQuery');
    assert.deepEqual(variables, {});
    queryHistory.push({ fetchKey: options.fetchKey });

    if (queryMode === 'loading') {
      throw pending;
    }
    if (queryMode === 'error') {
      throw new Error('follow requests query failed');
    }

    return {
      currentSession: {
        id: 'session-a',
        selectedProfile: selectedProfileId ? { id: selectedProfileId } : null,
      },
    };
  },
});
mockModule(new URL('./FollowRequestList.tsx', import.meta.url), {
  FollowRequestList: ({ profile }: { profile: { id: string } }) =>
    createElement('FollowRequestList', { identity: profile.id }),
  FollowRequestListState: ({
    loadingAnnouncement,
    state,
  }: {
    loadingAnnouncement?: boolean;
    state: string;
  }) => createElement('FollowRequestListState', { loadingAnnouncement, state }),
});
mockModule(new URL('../ui/ToastProvider.tsx', import.meta.url), {
  useToast: () => ({
    showToast: (
      message: string,
      options: {
        action?: { label: string; onPress: () => void };
        persistent?: boolean;
        tone?: string;
      },
    ) => {
      latestToastAction = options.action?.onPress ?? null;
      latestToast = {
        actionLabel: options.action?.label,
        message,
        persistent: options.persistent,
        tone: options.tone,
      };
      return () => {
        toastCleanupCount += 1;
      };
    },
  }),
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});
mockModule(new URL('../../relay/RelayActorProvider.tsx', import.meta.url), {
  useRelayActorLifecycleKey: () => 'actor-a',
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});

let FollowRequestsScreen: ComponentType | null = null;

before(async () => {
  const module = await import('../../app/(tabs)/(protected)/follow-requests').catch(() => null);
  FollowRequestsScreen = module?.default ?? null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  queryHistory.length = 0;
  queryMode = 'success';
  selectedProfileId = 'profile-a';
  toastCleanupCount = 0;
  openNavigationDrawer.mock.resetCalls();
  latestToastAction = null;
  latestToast = null;
});

async function renderScreen() {
  const Screen = FollowRequestsScreen;
  assert.ok(Screen, 'FollowRequestsScreen must exist');

  await act(async () => {
    if (renderer) {
      renderer.update(createElement(Screen));
    } else {
      renderer = create(createElement(Screen));
    }
  });
  assert.ok(renderer);
}

function rendered(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function requireRendered(type: string) {
  const node = rendered(type)[0];
  assert.ok(node);
  return node;
}

describe('follow requests route actor lifecycle', () => {
  it('현재 selected Profile fragment만 목록에 전달한다', async () => {
    await renderScreen();

    assert.deepEqual(
      rendered('FollowRequestList').map((node) => node.props.identity),
      ['profile-a'],
    );
  });

  it('selected Profile이 없으면 profile-required 상태를 표시한다', async () => {
    selectedProfileId = null;
    await renderScreen();

    assert.equal(requireRendered('FollowRequestListState').props.state, 'profileRequired');
    const menu = rendered('Pressable').find(
      (node) => node.props.accessibilityLabel === '메뉴 열기',
    );
    assert.ok(menu);
    await act(async () => menu.props.onPress());
    assert.equal(openNavigationDrawer.mock.callCount(), 1);
    assert.deepEqual(rendered('FollowRequestList'), []);
  });

  it('최초 query error는 initial error surface에서 같은 query를 재시도한다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryMode = 'error';
      await renderScreen();
      const loading = requireRendered('FollowRequestListState');
      assert.equal(
        rendered('Pressable').filter((node) => node.props.accessibilityLabel === '메뉴 열기')
          .length,
        1,
      );
      assert.equal(loading.props.state, 'loading');
      assert.equal(loading.props.loadingAnnouncement, false);
      assert.deepEqual(latestToast, {
        actionLabel: '다시 시도',
        message: '팔로워 요청을 불러오지 못했어요',
        persistent: true,
        tone: 'danger',
      });
      assert.ok(latestToastAction);
      const failedFetchKey = queryHistory.at(-1)?.fetchKey;

      queryMode = 'success';
      await act(async () => latestToastAction?.());

      assert.deepEqual(
        rendered('FollowRequestList').map((node) => node.props.identity),
        ['profile-a'],
      );
      assert.notEqual(queryHistory.at(-1)?.fetchKey, failedFetchKey);
      assert.equal(toastCleanupCount, 1);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('route boundary를 새로 만들면 retry key와 이전 Profile 표시를 재사용하지 않는다', async () => {
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      queryMode = 'error';
      await renderScreen();
      const failedFetchKey = queryHistory.at(-1)?.fetchKey;
      queryMode = 'success';
      await act(async () => latestToastAction?.());
      const retriedFetchKey = queryHistory.at(-1)?.fetchKey;
      assert.notEqual(retriedFetchKey, failedFetchKey);

      selectedProfileId = 'profile-b';
      await act(async () => renderer?.unmount());
      renderer = null;
      await renderScreen();

      assert.deepEqual(
        rendered('FollowRequestList').map((node) => node.props.identity),
        ['profile-b'],
      );
      assert.notEqual(queryHistory.at(-1)?.fetchKey, retriedFetchKey);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
