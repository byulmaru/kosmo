import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import { createElement, useEffect, useImperativeHandle, useLayoutEffect, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ElementType, ReactNode, Ref } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const routerActions: unknown[] = [];
let changeTab: ((value: string) => void) | undefined;
let leaveRoute: (() => void) | undefined;
const searchParams: { q?: string; tab: string } = { q: 'kosmo', tab: 'popular' };
let searchEdges: Array<{ cursor: string; node: { id: string } }> = [];
const host = (name: string) => name as ElementType;
const nativeTextWrites: string[] = [];
let inputFocusCount = 0;
let renderer: ReturnType<typeof create>;

// Model RN's controlled text reconciliation, including a render with stale header options.
function NativeTextInput({
  onChangeText,
  ref,
  value,
  ...props
}: {
  onChangeText: (value: string) => void;
  ref?: Ref<{ focus: () => void }>;
  value: string;
}) {
  const [nativeText, setNativeText] = useState(value);
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputFocusCount += 1;
    },
  }));
  useLayoutEffect(() => {
    if (nativeText !== value) {
      nativeTextWrites.push(value);
      setNativeText(value);
    }
  }, [nativeText, value]);
  return createElement('TextInput', {
    ...props,
    onChangeText: (next: string) => {
      setNativeText(next);
      onChangeText(next);
    },
    value: nativeText,
  });
}

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useFocusEffect: (effect: () => void | (() => void)) =>
    useEffect(() => {
      const cleanup = effect();
      leaveRoute = cleanup || undefined;
      return cleanup;
    }, [effect]),
  useLocalSearchParams: () => searchParams,
  useRouter: () => ({
    push: (href: string) => routerActions.push({ href, mode: 'push' }),
    setParams: (params: object) => routerActions.push({ mode: 'setParams', params }),
  }),
});
const icons = {
  ArrowLeft: 'ArrowLeft',
  CircleQuestionMark: 'CircleQuestionMark',
  History: 'History',
  Menu: 'Menu',
  Search: 'Search',
  X: 'X',
};
mockModule('lucide-react-native', icons);
mockModule(require.resolve('lucide-react-native'), icons);
mockModule('react-native', {
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  TextInput: NativeTextInput,
  useWindowDimensions: () => ({ height: 844, width: 390 }),
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: unknown) => key ?? null,
  useLazyLoadQuery: () => ({
    me: { id: 'account-1', profiles: [{ id: 'profile-1' }], metadata: [] },
    searchProfiles: { edges: searchEdges },
  }),
  usePaginationFragment: () => ({
    data: { searchProfiles: { edges: searchEdges } },
    hasNext: false,
    isLoadingNext: false,
    loadNext: () => undefined,
  }),
  useMutation: () => [() => undefined],
});
mockModule('@/analytics/client', {
  trackAnalytics: () => undefined,
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({
    accountId: 'account-1',
    selectedProfileId: 'profile-1',
    status: 'valid',
  }),
});
mockModule('@/components/PageHeader', {
  PageHeader: ({ children }: { children: ReactNode }) =>
    createElement('NativeStackHeader', null, children),
});
mockModule('@/components/PageHeaderView', {
  PageHeaderView: (props: object) => createElement('NativeStackHeader', props),
});
mockModule('@/components/shell/NavigationDrawerTrigger', { NavigationDrawerTrigger: () => null });
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 54 }),
});
mockModule('@/components/ui/Coachmark', {
  Coachmark: (props: object) => createElement('Coachmark', props),
});
mockModule('@/components/profile/ProfileListItem', {
  ProfileListItem: (props: object) => createElement('ProfileListItem', props),
});
mockModule('@/components/pagination/PaginationSurface', { PaginationSurface: () => null });
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children }: { children: ReactNode }) => children,
  useRouteBoundary: () => ({ fetchKey: 0 }),
});
mockModule('@/components/shell/NavigationLink', {
  NavigationLink: ({ children }: { children: ReactNode }) => children,
});
mockModule('@/components/shell/PrimaryNavigationScrollContext', {
  usePrimaryNavigationScroll: () => ({
    clearQueryNavigation: () => undefined,
    getQueryNavigation: () => null,
    recordQueryNavigation: () => undefined,
  }),
});
mockModule('@/components/shell/ShellChromeContext', { useShellChrome: () => null });
mockModule('@/components/shell/shellLayout', { getShellLayout: () => 'mobile' });
mockModule('@/components/ui/Button', { Button: () => null });
mockModule(new URL('../ui/IconButton.tsx', import.meta.url), {
  IconButton: (props: object) => createElement('IconButton', props),
});
mockModule('@/components/ui/StateView', { StateView: () => null });
mockModule('@/components/ui/Tabs', {
  Tab: () => null,
  TabList: ({
    onValueChange,
  }: {
    children?: ReactNode;
    onValueChange: (value: string) => void;
  }) => {
    changeTab = onValueChange;
    return null;
  },
});
mockModule('@/lib/recentSearches', {
  addRecentSearch: (items: string[]) => items,
  readRecentSearches: async () => ['kosmo'],
  writeRecentSearches: async () => undefined,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    backgroundCanvas: '#fff',
    backgroundSurface: '#fff',
    border: '#ddd',
    borderSubtle: '#ddd',
    foregroundPrimary: '#111',
    foregroundSecondary: '#777',
    stateDisabledForeground: '#999',
    stateDisabledSurface: '#eee',
    stateFocusRing: '#06f',
    surface: '#fff',
    text: '#111',
    textSecondary: '#777',
  }),
});
mockModule('@/observability/UnexpectedErrorContext', {
  useUnexpectedErrorReporter: () => undefined,
});

let SearchScreen: ComponentType;
let CoachmarkProvider: ComponentType<{ accountId?: string | null; children: ReactNode }>;

const searchScreen = (children: ReactNode = createElement(SearchScreen)) =>
  createElement(CoachmarkProvider, {
    accountId: 'account-1',
    children,
  });

before(async () => {
  ({ default: SearchScreen } = await import('../../app/(tabs)/(protected)/search'));
  ({ CoachmarkProvider } = await import('../coachmark/CoachmarkProvider'));
});

beforeEach(() => {
  routerActions.length = 0;
  changeTab = undefined;
  leaveRoute = undefined;
  searchEdges = [];
  searchParams.q = 'kosmo';
  searchParams.tab = 'popular';
});

function NativeStackHarness() {
  return searchScreen();
}

beforeEach(() => {
  routerActions.length = 0;
  nativeTextWrites.length = 0;
  inputFocusCount = 0;
  searchParams.q = 'kosmo';
  searchParams.tab = 'popular';
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
});

const input = () => renderer.root.findByType(host('TextInput'));
const focusSearch = async () => {
  await act(async () => {
    input().props.onFocus();
    renderer.root.findByProps({ accessibilityLabel: '검색' }).props.onFocus();
  });
};
const typeText = async (text: string) => {
  await act(async () => input().props.onChangeText(text));
};

test('Native 검색 탭 변경은 새 Stack 화면을 쌓지 않는다', async () => {
  await act(async () => {
    renderer = create(createElement(NativeStackHarness));
  });
  assert.ok(changeTab);

  await act(async () => changeTab?.('latest'));

  assert.deepEqual(routerActions, [{ mode: 'setParams', params: { tab: 'latest' } }]);
});

test('Native 검색은 헤더에 입력 하나를 두고 최초·결과·포커스 상태의 leading을 전환한다', async () => {
  searchParams.q = undefined;
  await act(async () => {
    renderer = create(createElement(NativeStackHarness));
  });

  let header = renderer!.root.findByType(host('NativeStackHeader'));
  assert.equal(renderer!.root.findAllByType(host('TextInput')).length, 1);
  assert.equal(header.findAllByType(host('TextInput')).length, 1);
  assert.equal(
    header
      .findAllByType(host('IconButton'))
      .filter(({ props }) => props.accessibilityLabel === '메뉴 열기').length,
    1,
  );

  await act(async () => header.findByProps({ accessibilityLabel: '검색' }).props.onFocus());
  header = renderer!.root.findByType(host('NativeStackHeader'));
  assert.equal(
    header
      .findAllByType(host('IconButton'))
      .filter(({ props }) => props.accessibilityLabel === '뒤로').length,
    1,
  );
  assert.equal(header.findByProps({ accessibilityLabel: '뒤로' }).props.feedbackTone, undefined);

  await typeText('초안 검색어');
  header = renderer!.root.findByType(host('NativeStackHeader'));
  await act(async () => {
    const back = header.findByProps({ accessibilityLabel: '뒤로' });
    back.props.onPressIn?.();
    back.props.onPress();
    searchParams.q = undefined;
    renderer?.update(createElement(NativeStackHarness));
  });
  assert.equal(input().props.value, '');
  header = renderer!.root.findByType(host('NativeStackHeader'));
  assert.equal(
    header
      .findAllByType(host('IconButton'))
      .filter(({ props }) => props.accessibilityLabel === '메뉴 열기').length,
    1,
  );

  await act(async () => renderer?.unmount());
  searchParams.q = 'kosmo';
  await act(async () => {
    renderer = create(createElement(NativeStackHarness));
  });

  header = renderer!.root.findByType(host('NativeStackHeader'));
  assert.equal(renderer!.root.findAllByType(host('TextInput')).length, 1);
  assert.equal(header.findAllByType(host('TextInput')).length, 1);
  assert.equal(
    header
      .findAllByType(host('IconButton'))
      .filter(({ props }) => props.accessibilityLabel === '뒤로').length,
    1,
  );
  assert.equal(
    header
      .findAllByType(host('IconButton'))
      .filter(({ props }) => props.accessibilityLabel === '검색 지우기').length,
    1,
  );
  assert.equal(
    header.findByProps({ accessibilityLabel: '검색 지우기' }).props.feedbackTone,
    undefined,
  );
  await act(async () => renderer?.unmount());
});

test('Native 헤더는 한글 조합 중 이전 controlled 값을 입력에 다시 쓰지 않는다', async () => {
  searchParams.q = undefined;
  await act(async () => {
    renderer = create(createElement(NativeStackHarness));
  });
  await focusSearch();
  const originalInput = input();

  for (const text of ['ㅎ', '하', '한', '한ㄱ', '한그', '한글', '한그', '한글 abc12']) {
    await typeText(text);
    assert.equal(input().props.value, text);
    assert.equal(input(), originalInput);
  }
  assert.deepEqual(nativeTextWrites, []);
  assert.deepEqual(routerActions, []);
});

test('Native 검색 제출은 마지막 음절이 포함된 이벤트 원문을 사용한다', async () => {
  searchParams.q = undefined;
  await act(async () => {
    renderer = create(createElement(NativeStackHarness));
  });
  await focusSearch();
  await typeText('한그');
  await act(async () => input().props.onSubmitEditing({ nativeEvent: { text: '한글' } }));
  assert.deepEqual(routerActions, [
    { mode: 'push', href: '/search?q=%ED%95%9C%EA%B8%80&tab=popular' },
  ]);
});

test('Native 검색 지우기는 q를 비우고 같은 입력에 포커스를 유지해 다시 조합할 수 있다', async () => {
  searchParams.q = '한글';
  await act(async () => {
    renderer = create(createElement(NativeStackHarness));
  });
  await focusSearch();
  await typeText('한글 검색');
  const originalInput = input();
  const clear = renderer.root.findByProps({ accessibilityLabel: '검색 지우기' });
  assert.ok(renderer.root.findAllByProps({ children: '최근 검색' }).length > 0);
  await act(async () => clear.props.onPressIn());
  assert.equal(input().props.value, '한글 검색');
  assert.ok(renderer.root.findAllByProps({ children: '최근 검색' }).length > 0);
  assert.deepEqual(routerActions, []);
  await act(async () => clear.props.onPress());
  assert.equal(input().props.value, '');
  assert.equal(input(), originalInput);
  assert.ok(inputFocusCount > 0);
  assert.deepEqual(routerActions, [{ mode: 'setParams', params: { q: undefined } }]);

  searchParams.q = undefined;
  await act(async () => renderer.update(createElement(NativeStackHarness)));
  nativeTextWrites.length = 0;
  for (const text of ['ㄱ', '거', '검', '검ㅅ', '검새', '검색']) {
    await typeText(text);
  }
  assert.equal(input().props.value, '검색');
  assert.deepEqual(nativeTextWrites, []);
});

test('Native 검색은 q 변경만 반영하고 입력 중 탭·포커스 변경에는 초안을 유지한다', async () => {
  await act(async () => {
    renderer = create(createElement(NativeStackHarness));
  });
  searchParams.q = '한글';
  await act(async () => renderer.update(createElement(NativeStackHarness)));
  assert.equal(input().props.value, '한글');

  await focusSearch();
  await typeText('한글 검색');
  searchParams.tab = 'latest';
  await act(async () => renderer.update(createElement(NativeStackHarness)));
  assert.equal(input().props.value, '한글 검색');
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '검색' }).props.onBlur());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  assert.equal(input().props.value, '한글 검색');
});

test('Native 검색에서 현재 최근 검색어를 다시 선택하면 초안을 결과 검색어로 맞춘다', async () => {
  await act(async () => {
    renderer = create(createElement(NativeStackHarness));
  });
  await focusSearch();
  await typeText('다른 검색');
  const recent = renderer.root
    .findAllByType(host('Pressable'))
    .find((node) => node.props.accessibilityRole === 'link');
  assert.ok(recent);
  let prevented = false;
  await act(async () =>
    recent.props.onPress({
      preventDefault: () => {
        prevented = true;
      },
    }),
  );
  assert.equal(prevented, true);
  assert.equal(input().props.value, 'kosmo');
  assert.deepEqual(routerActions, []);
});

test('검색 도움말은 draft를 유지하고 검색 제출이나 이동을 실행하지 않는다', async () => {
  searchParams.q = undefined;
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(searchScreen());
  });

  const input = renderer!.root.findByProps({ accessibilityLabel: '검색어' });
  const searchRegion = renderer!.root
    .findAllByType(host('View'))
    .find(({ props }) => props.onFocus && props.onBlur && !props.accessibilityLabel);
  assert.ok(searchRegion);
  await act(async () => searchRegion.props.onFocus());
  await act(async () => input.props.onChangeText('draft'));
  const inputAnchor = renderer!.root.findByProps({ testID: 'search-input-shell' });
  await act(async () => inputAnchor.props.onLayout?.());
  const help = renderer!.root.findByProps({ accessibilityLabel: '검색 도움말' });

  await act(async () => help.props.onPress());
  let coachmark = renderer!.root.findByType(host('Coachmark'));
  assert.equal(input.props.value, 'draft');
  assert.deepEqual(coachmark.props.progress, { current: 1, total: 3 });
  assert.ok(coachmark.props.anchorRef);

  await act(async () => coachmark.props.onNext());
  coachmark = renderer!.root.findByType(host('Coachmark'));
  assert.deepEqual(coachmark.props.progress, { current: 2, total: 3 });

  await act(async () => coachmark.props.onNext());
  coachmark = renderer!.root.findByType(host('Coachmark'));
  assert.deepEqual(coachmark.props.progress, { current: 3, total: 3 });
  assert.equal(coachmark.props.anchorRef, undefined);

  await act(async () => coachmark.props.onPrevious());
  coachmark = renderer!.root.findByType(host('Coachmark'));
  assert.deepEqual(coachmark.props.progress, { current: 2, total: 3 });
  await act(async () => coachmark.props.onPrevious());
  coachmark = renderer!.root.findByType(host('Coachmark'));
  assert.deepEqual(coachmark.props.progress, { current: 1, total: 3 });
  await act(async () => coachmark.props.onNext());
  await act(async () => renderer!.root.findByType(host('Coachmark')).props.onNext());
  await act(async () => renderer!.root.findByType(host('Coachmark')).props.onComplete());
  coachmark = renderer!.root.findByType(host('Coachmark'));
  await act(async () => coachmark.props.onExited?.());
  await act(async () => help.props.onPress());
  coachmark = renderer!.root.findByType(host('Coachmark'));
  assert.equal(input.props.value, 'draft');
  assert.deepEqual(coachmark.props.progress, { current: 1, total: 3 });
  assert.deepEqual(routerActions, []);

  await act(async () => renderer?.unmount());
});

test('검색 화면을 떠나면 진행 중인 도움말을 취소한다', async () => {
  searchParams.q = undefined;
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(searchScreen());
  });

  const searchRegion = renderer!.root
    .findAllByType(host('View'))
    .find(({ props }) => props.onFocus && props.onBlur && !props.accessibilityLabel);
  assert.ok(searchRegion);
  await act(async () => searchRegion.props.onFocus());
  const inputAnchor = renderer!.root.findByProps({ testID: 'search-input-shell' });
  await act(async () => inputAnchor.props.onLayout?.());
  const help = renderer!.root.findByProps({ accessibilityLabel: '검색 도움말' });
  await act(async () => help.props.onPress());
  assert.equal(renderer!.root.findAllByType(host('Coachmark')).length, 1);

  await act(async () => {
    searchRegion.props.onBlur();
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  assert.equal(renderer!.root.findAllByType(host('Coachmark')).length, 1);
  assert.ok(leaveRoute);
  await act(async () => leaveRoute?.());
  assert.equal(renderer!.root.findAllByType(host('Coachmark')).length, 0);

  await act(async () => renderer?.unmount());
});

test('결과가 늦게 준비되어도 시작한 안내를 유지하고 다시 열면 현재 결과를 가리킨다', async () => {
  searchParams.q = 'remote';
  searchParams.tab = 'people';
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(searchScreen(), { createNodeMock: () => ({}) });
  });

  const inputAnchor = renderer!.root.findByProps({ testID: 'search-input-shell' });
  await act(async () => inputAnchor.props.onLayout?.());
  let coachmark = renderer!.root.findByType(host('Coachmark'));
  await act(async () => coachmark.props.onNext());
  assert.deepEqual(renderer!.root.findByType(host('Coachmark')).props.progress, {
    current: 2,
    total: 3,
  });

  searchEdges = [{ cursor: 'remote', node: { id: 'profile-remote' } }];
  await act(async () => renderer?.update(searchScreen()));
  coachmark = renderer!.root.findByType(host('Coachmark'));
  await act(async () => coachmark.props.onNext());
  coachmark = renderer!.root.findByType(host('Coachmark'));
  assert.equal(coachmark.props.anchorRef, undefined);

  await act(async () => coachmark.props.onComplete());
  await act(async () => renderer!.root.findByType(host('Coachmark')).props.onExited?.());
  const help = renderer!.root.findByProps({ accessibilityLabel: '검색 도움말' });
  await act(async () => help.props.onPress());
  coachmark = renderer!.root.findByType(host('Coachmark'));
  await act(async () => coachmark.props.onNext());
  await act(async () => coachmark.props.onNext());
  assert.ok(renderer!.root.findByType(host('Coachmark')).props.anchorRef);

  searchEdges = [];
  await act(async () => renderer?.update(searchScreen()));
  assert.equal(renderer!.root.findAllByType(host('Coachmark')).length, 0);

  await act(async () => renderer?.unmount());
});

test('입력 중 수동으로 시작한 안내도 늦은 결과 mount 뒤 중앙 단계를 유지한다', async () => {
  searchParams.q = 'remote';
  searchParams.tab = 'people';
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(searchScreen(), { createNodeMock: () => ({}) });
  });

  const searchRegion = renderer!.root
    .findAllByType(host('View'))
    .find(({ props }) => props.onFocus && props.onBlur && !props.accessibilityLabel);
  assert.ok(searchRegion);
  await act(async () => searchRegion.props.onFocus());
  const inputAnchor = renderer!.root.findByProps({ testID: 'search-input-shell' });
  await act(async () => inputAnchor.props.onLayout?.());
  const help = renderer!.root.findByProps({ accessibilityLabel: '검색 도움말' });
  await act(async () => help.props.onPress());
  await act(async () => {
    searchRegion.props.onBlur();
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

  searchEdges = [{ cursor: 'remote', node: { id: 'profile-remote' } }];
  await act(async () => renderer?.update(searchScreen()));
  assert.equal(renderer!.root.findAllByType(host('ProfileListItem')).length, 1);
  let coachmark = renderer!.root.findByType(host('Coachmark'));
  await act(async () => coachmark.props.onNext());
  await act(async () => coachmark.props.onNext());
  coachmark = renderer!.root.findByType(host('Coachmark'));
  assert.equal(coachmark.props.anchorRef, undefined);

  await act(async () => renderer?.unmount());
});
