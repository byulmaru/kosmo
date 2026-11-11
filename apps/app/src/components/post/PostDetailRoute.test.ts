import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
let status = 'valid';
let state: 'loading' | 'error' | 'missing' | 'content' = 'loading';
let postReference = 'AbCdEf123456';
let postState = 'PUBLISHED';
let requestedReference: string | undefined;
let renderer: ReactTestRenderer | undefined;
const back = mock.fn();
const replace = mock.fn((href: string) => {
  postReference = href.split('/').at(-1) ?? postReference;
});
const openNavigationDrawer = mock.fn();
const router = { back, replace };
mockModule('expo-router', {
  useLocalSearchParams: () => ({ postId: postReference, profileHandle: '@writer' }),
  usePathname: () => `/@writer/${postReference}`,
  useRouter: () => router,
  useSegments: () => ['(tabs)', '(post)', '[profileHandle]', '[postId]'],
  useIsFocused: () => true,
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
mockModule(require.resolve('lucide-react-native'), {
  ChevronLeftIcon: 'ChevronLeftIcon',
  Menu: 'Menu',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useLazyLoadQuery: (_query: unknown, variables: { reference: string }) => {
    requestedReference = variables.reference;
    return {
      postByReference:
        state === 'missing'
          ? null
          : {
              __typename: 'Post',
              id: 'database-post-id',
              slug: 'AbCdEf123456',
              content: { id: 'content' },
              profile: { relativeHandle: '@writer' },
              thread: {},
              state: postState,
            },
    };
  },
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
mockModule('@/components/ui/StateView', {
  StateView: ({ title }: { title?: string }) =>
    createElement('Text', { testID: 'route-state', title }),
});
mockModule('@/components/post/PostDetailThread', {
  PostDetailFrame: ({ children, header }: PropsWithChildren<{ header: ReactNode }>) =>
    createElement('View', null, header, children),
  PostDetailThread: ({ header, identity }: { header: ReactNode; identity: string }) =>
    createElement('View', { identity, testID: 'post-detail-thread' }, header),
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
  replace.mock.resetCalls();
  openNavigationDrawer.mock.resetCalls();
  state = 'loading';
  postReference = 'AbCdEf123456';
  postState = 'PUBLISHED';
  requestedReference = undefined;
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

test('slug reference resolves to the same Post and keeps normalized Post.id as thread identity', async () => {
  state = 'content';
  postReference = 'AbCdEf123456';

  await act(async () => {
    renderer = create(createElement(Screen));
  });

  assert.equal(requestedReference, 'AbCdEf123456');
  assert.equal(
    renderer!.root.findByProps({ testID: 'post-detail-thread' }).props.identity,
    'database-post-id',
  );
  assert.equal(replace.mock.callCount(), 0);
});

test('legacy 27-character Post global ID opens and canonicalizes to the Post slug', async () => {
  state = 'content';
  postReference = 'legacyPostGlobalID123456789';

  await act(async () => {
    renderer = create(createElement(Screen));
  });

  assert.equal(requestedReference, 'legacyPostGlobalID123456789');
  assert.deepEqual(
    replace.mock.calls.map(({ arguments: [href] }) => href),
    ['/@writer/AbCdEf123456'],
  );

  await act(async () => {
    renderer?.update(createElement(Screen));
  });

  assert.equal(requestedReference, 'AbCdEf123456');
  assert.equal(
    renderer!.root.findByProps({ testID: 'post-detail-thread' }).props.identity,
    'database-post-id',
  );
});

test('slug lookup preserves the deleted Post visibility state', async () => {
  state = 'content';
  postState = 'DELETED';

  await act(async () => {
    renderer = create(createElement(Screen));
  });

  assert.equal(renderer!.root.findAllByProps({ testID: 'post-detail-thread' }).length, 0);
  assert.equal(
    renderer!.root.findByProps({ testID: 'route-state' }).props.title,
    '삭제된 게시글이에요',
  );
});
