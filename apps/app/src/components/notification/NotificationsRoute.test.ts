import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement, useCallback, useEffect, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { useNotificationReadAll as ReadAllHook } from './NotificationReadAllContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
let state: 'loading' | 'error' | 'content' | 'profileRequired' = 'loading';
let isFocused = false;
const unreadIds = ['loaded-unread'];
const commits: Array<{ variables: { ids: string[] }; onError: (error: Error) => void }> = [];
const queryFetchPolicies: Array<'store-and-network' | 'network-only'> = [];
let renderer: ReactTestRenderer | undefined;
let useNotificationReadAll: typeof ReadAllHook;
const openNavigationDrawer = mock.fn();
const resetRouteBoundary = () => {
  state = 'content';
};
mockModule('react-native', {
  Platform: { OS: 'web' },
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  View: 'View',
  Pressable: 'Pressable',
  useWindowDimensions: () => ({ width: 390, height: 844 }),
});
mockModule('expo-router', {
  useFocusEffect: (effect: () => (() => void) | void) => {
    useEffect(() => {
      if (!isFocused) {
        return;
      }
      return effect();
    }, [effect, isFocused]);
  },
  useIsFocused: () => isFocused,
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
});
mockModule('lucide-react-native', { Menu: 'Menu' });
mockModule(require.resolve('lucide-react-native'), { Menu: 'Menu' });
mockModule('react-relay', {
  graphql: () => ({}),
  useQueryLoader: () => {
    const [queryReference, setQueryReference] = useState<{ profileId: string } | null>(null);
    const loadQuery = useCallback(
      (_variables: object, options: { fetchPolicy: 'store-and-network' | 'network-only' }) => {
        queryFetchPolicies.push(options.fetchPolicy);
        setQueryReference({ profileId: `profile-${queryFetchPolicies.length}` });
      },
      [],
    );
    return [queryReference, loadQuery];
  },
  usePreloadedQuery: (_query: unknown, queryReference: { profileId: string }) => ({
    currentSession: {
      selectedProfile: state === 'profileRequired' ? null : { id: queryReference.profileId },
    },
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
  }: PropsWithChildren<{ loading: ReactNode; error: (reset: () => void) => ReactNode }>) =>
    state === 'loading' ? loading : state === 'error' ? error(resetRouteBoundary) : children,
});
mockModule('@/components/notification/NotificationList', {
  NotificationList: ({ active = true, profile }: { active?: boolean; profile: { id: string } }) => {
    const { publishUnreadIds } = useNotificationReadAll();
    useEffect(
      () => (active ? publishUnreadIds(unreadIds) : undefined),
      [active, profile.id, publishUnreadIds],
    );
    return createElement('Text', null, profile.id);
  },
  NotificationListState: ({
    onRetry,
    state: listState,
  }: {
    onRetry?: () => void;
    state: 'error' | 'loading' | 'profileRequired';
  }) =>
    listState === 'error'
      ? createElement('Pressable', { accessibilityLabel: 'route-retry', onPress: onRetry }, 'retry')
      : createElement('Text', null, listState),
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
  renderer = undefined;
  isFocused = false;
  commits.length = 0;
  queryFetchPolicies.length = 0;
  openNavigationDrawer.mock.resetCalls();
});
const tree = () => createElement(Provider, null, createElement(Screen));
const readAllButton = () =>
  renderer!.root
    .findAll((node) => (node.type as unknown) === 'Pressable')
    .find((node) => node.props.accessibilityLabel === '모두 읽음')!;

test('알림 route는 모든 목록 상태에서 헤더와 메뉴를 유지하고 로드된 unread만 읽음 처리한다', async () => {
  isFocused = true;
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

test('알림 route는 focus 진입 때 새 데이터를 불러오고 오류 재시도 뒤 목록을 복구한다', async () => {
  state = 'content';
  isFocused = false;
  await act(async () => {
    renderer = create(tree());
  });
  assert.equal(queryFetchPolicies.length, 0);

  isFocused = true;
  await act(async () => renderer!.update(tree()));
  assert.deepEqual(queryFetchPolicies, ['store-and-network']);
  assert.ok(
    renderer!.root.findAll(
      (node) => (node.type as unknown) === 'Text' && node.props.children === 'profile-1',
    ).length,
  );
  assert.equal(readAllButton().props.disabled, false);

  isFocused = false;
  await act(async () => renderer!.update(tree()));
  assert.equal(queryFetchPolicies.length, 1);
  assert.equal(readAllButton().props.disabled, true);

  isFocused = true;
  await act(async () => renderer!.update(tree()));
  assert.deepEqual(queryFetchPolicies, ['store-and-network', 'store-and-network']);
  assert.ok(
    renderer!.root.findAll(
      (node) => (node.type as unknown) === 'Text' && node.props.children === 'profile-2',
    ).length,
  );

  state = 'error';
  await act(async () => renderer!.update(tree()));
  const retry = renderer!.root.find(
    (node) =>
      (node.type as unknown) === 'Pressable' && node.props.accessibilityLabel === 'route-retry',
  );
  await act(async () => retry.props.onPress());

  assert.deepEqual(queryFetchPolicies, ['store-and-network', 'store-and-network', 'network-only']);
  assert.ok(
    renderer!.root.findAll(
      (node) => (node.type as unknown) === 'Text' && node.props.children === 'profile-3',
    ).length,
  );
});
