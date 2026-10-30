import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement, useEffect, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { useNotificationReadAll as ReadAllHook } from './NotificationReadAllContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
let state: 'loading' | 'error' | 'content' | 'profileRequired' = 'loading';
const unreadIds = ['loaded-unread'];
const commits: Array<{ variables: { ids: string[] }; onError: (error: Error) => void }> = [];
let renderer: ReactTestRenderer | undefined;
let useNotificationReadAll: typeof ReadAllHook;
const openNavigationDrawer = mock.fn();
mockModule('react-native', {
  Platform: { OS: 'web' },
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  View: 'View',
  Pressable: 'Pressable',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
});
mockModule('lucide-react-native', { Menu: 'Menu' });
mockModule(require.resolve('lucide-react-native'), { Menu: 'Menu' });
mockModule('react-relay', {
  graphql: () => ({}),
  useLazyLoadQuery: () => ({
    currentSession: { selectedProfile: state === 'profileRequired' ? null : { id: 'profile' } },
  }),
  useMutation: () => {
    const [pending, setPending] = useState(false);
    return [
      (config: (typeof commits)[number]) => {
        commits.push(config);
        setPending(true);
      },
      pending,
    ];
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
mockModule('@/components/notification/NotificationList', {
  NotificationList: () => {
    const { publishUnreadIds } = useNotificationReadAll();
    useEffect(() => publishUnreadIds(unreadIds), [publishUnreadIds]);
    return createElement('Text', null, '목록');
  },
  NotificationListState: () => null,
});
mockModule('@/components/BrandLogo', { BrandLogo: () => null });
mockModule('@/components/shell/NavigationLink', {
  NavigationLink: ({ children }: PropsWithChildren) => children,
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: PropsWithChildren) =>
    createElement('Pressable', props, children),
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: PropsWithChildren) =>
    createElement('Pressable', props, children),
});
mockModule('@/components/ui/ToastProvider', { useToast: () => ({ showToast: () => undefined }) });
mockModule('@/components/shell/ShellChromeContext', {
  useShellChrome: () => ({ navigationDrawerOpen: false, openNavigationDrawer }),
});
mockModule('@/relay/RelayActorProvider', { useRelayActorLifecycleKey: () => 'actor-a' });
mockModule('@/theme/ThemeProvider', { useTheme: () => ({ text: '#111' }) });

let Screen: ComponentType;
let Provider: ComponentType<PropsWithChildren>;
before(async () => {
  ({ useNotificationReadAll, NotificationReadAllProvider: Provider } =
    await import('./NotificationReadAllContext'));
  ({ default: Screen } = await import('../../app/(tabs)/(protected)/notifications'));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  commits.length = 0;
  openNavigationDrawer.mock.resetCalls();
});
const tree = () => createElement(Provider, null, createElement(Screen));
const readAllButton = () =>
  renderer!.root
    .findAll((node) => (node.type as unknown) === 'Pressable')
    .find((node) => node.props.accessibilityLabel === '모두 읽음')!;

test('알림 route는 모든 목록 상태에서 헤더와 메뉴를 유지하고 로드된 unread만 읽음 처리한다', async () => {
  state = 'loading';
  await act(async () => {
    renderer = create(tree());
  });
  for (const next of ['loading', 'error', 'profileRequired', 'content'] as const) {
    state = next;
    await act(async () => renderer!.update(tree()));
    assert.equal(
      renderer!.root
        .findAll((node) => (node.type as unknown) === 'Text')
        .filter(
          (node) => node.props.accessibilityRole === 'header' && node.props.children === '알림',
        ).length,
      1,
    );
    const menus = renderer!.root
      .findAll((node) => (node.type as unknown) === 'Pressable')
      .filter((node) => node.props.accessibilityLabel === '메뉴 열기');
    assert.equal(menus.length, 1);
    await act(async () => menus[0]!.props.onPress());
    assert.equal(readAllButton().props.disabled, next !== 'content');
  }
  await act(async () => readAllButton().props.onPress());
  assert.deepEqual(
    commits.map((commit) => commit.variables),
    [{ ids: ['loaded-unread'] }],
  );
  assert.equal(readAllButton().props.disabled, true);
  state = 'loading';
  await act(async () => renderer!.update(tree()));
  state = 'content';
  await act(async () => renderer!.update(tree()));
  assert.equal(readAllButton().props.disabled, true);
  assert.equal(commits.length, 1);
});
