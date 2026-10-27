import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
let status = 'valid';
let state: 'loading' | 'error' | 'missing' | 'content' = 'loading';
let renderer: ReactTestRenderer | undefined;
const back = mock.fn();
const openNavigationDrawer = mock.fn();
const router = { back, replace: () => undefined };
mockModule('expo-router', {
  useLocalSearchParams: () => ({ postId: 'post', profileHandle: '@writer' }),
  usePathname: () => '/@writer/post',
  useRouter: () => router,
  useSegments: () => ['(tabs)', '(post)', '[profileHandle]', '[postId]'],
});
mockModule('react-native', {
  Platform: { OS: 'web' },
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  View: 'View',
  Pressable: 'Pressable',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
});
mockModule('lucide-react-native', { ChevronLeftIcon: 'ChevronLeftIcon', Menu: 'Menu' });
mockModule('react-relay', {
  graphql: () => ({}),
  useLazyLoadQuery: () => ({
    node:
      state === 'missing'
        ? null
        : {
            __typename: 'Post',
            id: 'post',
            content: { id: 'content' },
            profile: { relativeHandle: '@writer' },
            thread: {},
            state: 'PUBLISHED',
          },
  }),
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({
    children,
    loading,
    error,
  }: PropsWithChildren<{ loading: ReactNode; error: () => ReactNode }>) =>
    state === 'loading' ? loading : state === 'error' ? error() : children,
  useRouteBoundary: () => ({ fetchKey: 0, refetch: () => undefined }),
});
mockModule('@/components/BrandLogo', { BrandLogo: () => null });
mockModule('@/components/shell/NavigationLink', {
  NavigationLink: ({ children }: PropsWithChildren) => children,
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: PropsWithChildren) =>
    createElement('Pressable', props, children),
});
mockModule('@/components/ui/StateView', { StateView: () => null });
mockModule('@/components/post/PostDetailThread', {
  PostDetailFrame: ({ children, header }: PropsWithChildren<{ header: ReactNode }>) =>
    createElement('View', null, header, children),
  PostDetailThread: ({ header }: { header: ReactNode }) => header,
});
mockModule('@/components/shell/PrimaryNavigationScrollContext', {
  usePrimaryNavigationScroll: () => ({ isHistoryEntryRestoration: () => false }),
});
mockModule('@/components/shell/ShellChromeContext', {
  useShellChrome: () => ({ navigationDrawerOpen: false, openNavigationDrawer }),
});
mockModule('@/session/SessionProvider', { useSession: () => ({ status }) });
mockModule('@/theme/ThemeProvider', { useTheme: () => ({ text: '#111' }) });

let Screen: ComponentType;
before(async () => {
  ({ default: Screen } = await import('../../app/(tabs)/(post)/[profileHandle]/[postId]'));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  back.mock.resetCalls();
  openNavigationDrawer.mock.resetCalls();
});

for (const session of ['valid', 'guest']) {
  test(`모바일 게시글 route는 ${session} 세션의 모든 상태에서 단일 제목과 탐색 action을 유지한다`, async () => {
    status = session;
    for (const nextState of ['loading', 'error', 'missing', 'content'] as const) {
      state = nextState;
      await act(async () => {
        renderer = create(createElement(Screen));
      });
      assert.equal(
        renderer!.root
          .findAll((node) => (node.type as unknown) === 'Text')
          .filter(
            (node) => node.props.accessibilityRole === 'header' && node.props.children === '게시글',
          ).length,
        1,
      );
      const actions = renderer!.root.findAll((node) => (node.type as unknown) === 'Pressable');
      assert.equal(actions.length, 1);
      assert.equal(
        actions[0]!.props.accessibilityLabel,
        session === 'guest' ? '메뉴 열기' : '뒤로 가기',
      );
      await act(async () => actions[0]!.props.onPress());
      await act(async () => renderer!.unmount());
    }
    assert.equal((session === 'guest' ? openNavigationDrawer : back).mock.callCount(), 4);
    assert.equal((session === 'guest' ? back : openNavigationDrawer).mock.callCount(), 0);
  });
}
