import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const platform = { OS: 'ios' };
let width = 390;
let boundaryState: 'content' | 'loading' = 'content';
let renderer: ReactTestRenderer | undefined;
const shellChrome = {
  navigationDrawerOpen: false,
  openNavigationDrawer: () => {
    shellChrome.navigationDrawerOpen = true;
  },
};

mockModule('expo-router', {
  Redirect: () => null,
  useLocalSearchParams: () => ({ timeline: 'local' }),
  useRouter: () => ({ replace: () => undefined, setParams: () => undefined }),
});
mockModule('lucide-react-native', { Menu: 'Menu', UserRoundPlus: 'UserRoundPlus' });
mockModule(require.resolve('lucide-react-native'), {
  Menu: 'Menu',
  UserRoundPlus: 'UserRoundPlus',
});
mockModule('react-native', {
  Platform: platform,
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  useWindowDimensions: () => ({ height: 844, width }),
  View: 'View',
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
});
mockModule('react-error-boundary', {
  useErrorBoundary: () => ({ showBoundary: () => undefined }),
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, data: unknown) => data,
  useLazyLoadQuery: () => ({
    currentSession: { id: 'session', selectedProfile: { id: 'profile' } },
    me: { id: 'me', profiles: [{ id: 'profile' }] },
  }),
  useRefetchableFragment: () => [null, () => undefined],
  useRelayEnvironment: () => ({
    check: () => ({ status: 'missing' }),
    retain: () => ({ dispose: () => undefined }),
  }),
});
mockModule('relay-runtime', {
  createOperationDescriptor: () => ({}),
  fetchQuery: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
  getRequest: () => ({}),
});
mockModule('@/components/BrandLogo', { BrandLogo: () => null });
mockModule('@/components/shell/NavigationLink', {
  NavigationLink: ({ children }: { children: ReactNode }) => children,
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children: ReactNode }) =>
    createElement('Pressable', props, children),
});
mockModule('@/components/post/PostList', { PostList: () => null });
mockModule('@/components/RelayFailOpenBoundary', {
  RelayFailOpenBoundary: ({ children }: { children: ReactNode }) => children,
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children, loading }: { children: ReactNode; loading: ReactNode }) =>
    boundaryState === 'loading' ? loading : children,
  useRouteBoundary: () => ({ fetchKey: 0 }),
});
mockModule('@/components/shell/ShellChromeContext', { useShellChrome: () => shellChrome });
mockModule('@/components/TimelineTabs', { TimelineTabs: () => null });
mockModule('@/components/ui/Button', { Button: () => null });
mockModule('@/components/ui/StateView', { Skeleton: () => null, StateView: () => null });
mockModule('@/components/ui/ToastProvider', { useToast: () => ({ showToast: () => undefined }) });
mockModule('@/session/SessionProvider', { useSession: () => ({ status: 'valid' }) });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ text: '#111', textSecondary: '#777' }),
});

let HomeScreen: ComponentType;
let HomeTimelineScreen: ComponentType;
let LocalTimelineScreen: ComponentType<{ publicEntry?: boolean }>;

before(async () => {
  ({ default: HomeScreen } = await import('../../app/(tabs)/(protected)/home'));
  ({ default: HomeTimelineScreen } = await import('./HomeTimelineScreen'));
  ({ default: LocalTimelineScreen } = await import('./LocalTimelineScreen'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  platform.OS = 'ios';
  width = 390;
  boundaryState = 'content';
  shellChrome.navigationDrawerOpen = false;
});

test('Native 타임라인 파라미터가 Local이면 같은 route에서 Local 콘텐츠를 표시한다', async () => {
  await act(async () => {
    renderer = create(createElement(HomeScreen));
  });

  const header = renderer!.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .filter((node) => node.props.accessibilityRole === 'header');
  assert.equal(header[0]?.props.children, '로컬');
});

test('모바일 Web route는 로딩부터 콘텐츠까지 자기 메뉴와 단일 타임라인 제목을 유지한다', async () => {
  platform.OS = 'web';
  for (const [Screen, title, props] of [
    [HomeTimelineScreen, '홈', {}],
    [LocalTimelineScreen, '로컬', {}],
    [LocalTimelineScreen, '타임라인 둘러보기', { publicEntry: true }],
  ] as const) {
    boundaryState = 'loading';
    await act(async () => {
      renderer = create(createElement(Screen as ComponentType<{ publicEntry?: boolean }>, props));
    });
    for (const state of ['loading', 'content'] as const) {
      boundaryState = state;
      await act(async () =>
        renderer!.update(createElement(Screen as ComponentType<{ publicEntry?: boolean }>, props)),
      );
      const headings = renderer!.root
        .findAll((node) => (node.type as unknown) === 'Text')
        .filter(
          (node) => node.props.accessibilityRole === 'header' && node.props.children === title,
        );
      assert.equal(headings.length, 1);
      const menu = renderer!.root
        .findAll((node) => (node.type as unknown) === 'Pressable')
        .filter((node) => node.props.accessibilityLabel === '메뉴 열기');
      assert.equal(menu.length, 1);
      assert.equal(
        renderer!.root
          .findAll((node) => (node.type as unknown) === 'Pressable')
          .filter((node) => node.props.accessibilityRole === 'link').length,
        0,
      );
      await act(async () => menu[0]!.props.onPress());
      await act(async () =>
        renderer!.update(createElement(Screen as ComponentType<{ publicEntry?: boolean }>, props)),
      );
      assert.equal(
        renderer!.root
          .findAll((node) => (node.type as unknown) === 'Pressable')
          .find((node) => node.props.accessibilityLabel === '메뉴 열기')!.props.accessibilityState
          .expanded,
        true,
      );
    }
    await act(async () => renderer!.unmount());
    renderer = undefined;
  }
});
