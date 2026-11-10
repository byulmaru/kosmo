import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement, useCallback, useEffect, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, PropsWithChildren } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { useNotificationReadAll as ReadAllHook } from './NotificationReadAllContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
let isFocused = false;
let selectedProfileRequired = false;
const failedQueryProfiles = new Set<string>();
const unreadIds = ['loaded-unread'];
const commits: Array<{ variables: { ids: string[] }; onError: (error: Error) => void }> = [];
const queryFetchPolicies: Array<'store-and-network' | 'network-only'> = [];
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
  usePreloadedQuery: (_query: unknown, queryReference: { profileId: string }) => {
    if (failedQueryProfiles.has(queryReference.profileId)) {
      throw new Error('notifications query failed');
    }
    return {
      currentSession: {
        selectedProfile: selectedProfileRequired ? null : { id: queryReference.profileId },
      },
    };
  },
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
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../../observability/UnexpectedErrorContext.ts', import.meta.url), {
  useUnexpectedErrorReporter: () => undefined,
});

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
  selectedProfileRequired = false;
  failedQueryProfiles.clear();
  commits.length = 0;
  queryFetchPolicies.length = 0;
  openNavigationDrawer.mock.resetCalls();
});
const tree = () => createElement(Provider, null, createElement(Screen));
const readAllButton = () =>
  renderer!.root
    .findAll((node) => (node.type as unknown) === 'Pressable')
    .find((node) => node.props.accessibilityLabel === '모두 읽음')!;
const assertHeaderAndMenu = () => {
  assert.equal(
    renderer!.root
      .findAll((node) => (node.type as unknown) === 'Text')
      .filter((node) => node.props.accessibilityRole === 'header' && node.props.children === '알림')
      .length,
    1,
  );
  assert.equal(
    renderer!.root
      .findAll((node) => (node.type as unknown) === 'Pressable')
      .filter((node) => node.props.accessibilityLabel === '메뉴 열기').length,
    1,
  );
};
const assertProfile = (profileId: string) => {
  assert.ok(
    renderer!.root.findAll(
      (node) => (node.type as unknown) === 'Text' && node.props.children === profileId,
    ).length,
  );
};
const setFocused = async (focused: boolean) => {
  isFocused = focused;
  await act(async () => renderer!.update(tree()));
};

test('알림 route는 로딩 및 프로필 상태에서도 헤더를 유지하고 로드된 unread만 읽음 처리한다', async () => {
  isFocused = false;
  await act(async () => {
    renderer = create(tree());
  });
  assertHeaderAndMenu();
  assert.ok(
    renderer!.root.findAll(
      (node) => (node.type as unknown) === 'Text' && node.props.children === 'loading',
    ).length,
  );
  assert.equal(readAllButton().props.disabled, true);

  await setFocused(true);
  assertHeaderAndMenu();
  assertProfile('profile-1');
  assert.equal(readAllButton().props.disabled, false);
  const menu = renderer!.root.findByProps({ accessibilityLabel: '메뉴 열기' });
  await act(async () => menu.props.onPress());
  await act(async () => readAllButton().props.onPress());
  assert.deepEqual(
    commits.map((commit) => commit.variables),
    [{ ids: ['loaded-unread'] }],
  );
  assert.equal(readAllButton().props.disabled, true);

  selectedProfileRequired = true;
  await setFocused(false);
  await setFocused(true);
  assertHeaderAndMenu();
  assert.ok(
    renderer!.root.findAll(
      (node) => (node.type as unknown) === 'Text' && node.props.children === 'profileRequired',
    ).length,
  );
  assert.equal(readAllButton().props.disabled, true);
  assert.equal(commits.length, 1);
});

test('알림 route는 실패 뒤 재진입과 명시적 재시도로 목록을 복구한다', async () => {
  const originalConsoleError = console.error;
  console.error = () => undefined;
  isFocused = false;
  try {
    await act(async () => {
      renderer = create(tree());
    });
    assert.equal(queryFetchPolicies.length, 0);

    await setFocused(true);
    assert.deepEqual(queryFetchPolicies, ['store-and-network']);
    assertProfile('profile-1');
    assert.equal(readAllButton().props.disabled, false);

    failedQueryProfiles.add('profile-2');
    await setFocused(false);
    await setFocused(true);
    assert.deepEqual(queryFetchPolicies, ['store-and-network', 'store-and-network']);
    assertHeaderAndMenu();
    assert.ok(renderer!.root.findByProps({ accessibilityLabel: 'route-retry' }));
    assert.equal(readAllButton().props.disabled, true);

    failedQueryProfiles.delete('profile-2');
    await setFocused(false);
    await setFocused(true);
    assert.deepEqual(queryFetchPolicies, [
      'store-and-network',
      'store-and-network',
      'store-and-network',
    ]);
    assertProfile('profile-3');
    assert.equal(readAllButton().props.disabled, false);

    failedQueryProfiles.add('profile-4');
    await setFocused(false);
    await setFocused(true);
    assertHeaderAndMenu();
    assert.ok(renderer!.root.findByProps({ accessibilityLabel: 'route-retry' }));
    failedQueryProfiles.delete('profile-4');
    const retry = renderer!.root.findByProps({ accessibilityLabel: 'route-retry' });
    await act(async () => retry.props.onPress());

    assert.deepEqual(queryFetchPolicies, [
      'store-and-network',
      'store-and-network',
      'store-and-network',
      'store-and-network',
      'network-only',
    ]);
    assertProfile('profile-5');
    assert.equal(readAllButton().props.disabled, false);
  } finally {
    console.error = originalConsoleError;
  }
});
