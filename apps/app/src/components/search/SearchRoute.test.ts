import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import {
  createElement,
  Fragment,
  memo,
  useImperativeHandle,
  useLayoutEffect,
  useState,
} from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, Dispatch, ElementType, ReactNode, Ref, SetStateAction } from 'react';
import type { PageHeaderProps } from '../PageHeaderView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const routerActions: unknown[] = [];
let changeTab: ((value: string) => void) | undefined;
const searchParams: { q?: string; tab: string } = { q: 'kosmo', tab: 'popular' };
const host = (name: string) => name as ElementType;
type HeaderOptions = { header?: () => ReactNode; headerShown?: boolean };
let setHeaderOptions: Dispatch<SetStateAction<HeaderOptions>>;
const navigation = {
  setOptions: (options: HeaderOptions) =>
    setHeaderOptions((current) => ({ ...current, ...options })),
};
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
  useLocalSearchParams: () => searchParams,
  useNavigation: () => navigation,
  useRouter: () => ({
    push: (href: string) => routerActions.push({ href, mode: 'push' }),
    setParams: (params: object) => routerActions.push({ mode: 'setParams', params }),
  }),
});
const icons = {
  ArrowLeft: 'ArrowLeft',
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
mockModule('react-relay', { graphql: () => ({}), useFragment: () => ({}) });
mockModule('@/analytics/client', {
  trackAnalytics: () => undefined,
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ accountId: null, selectedProfileId: null, status: 'guest' }),
});
let NativePageHeader: ComponentType<PageHeaderProps>;
mockModule('@/components/PageHeader', {
  PageHeader: (props: PageHeaderProps) => createElement(NativePageHeader, props),
});
mockModule('@/components/PageHeaderView', {
  PageHeaderView: (props: object) => createElement('NativeStackHeader', props),
});
mockModule('@/components/shell/NavigationDrawerTrigger', { NavigationDrawerTrigger: () => null });
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 54 }),
});
mockModule('@/components/profile/ProfileListItem', { ProfileListItem: () => null });
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

let SearchScreen: ComponentType;
let StackScreen: ComponentType<{ query?: string; tab: string }>;

before(async () => {
  ({ PageHeader: NativePageHeader } = await import('../PageHeader.native'));
  ({ default: SearchScreen } = await import('../../app/(tabs)/(protected)/search'));
  StackScreen = memo(SearchScreen);
});

function NativeStackHarness() {
  const [options, setOptions] = useState<HeaderOptions>({});
  setHeaderOptions = setOptions;
  return createElement(
    Fragment,
    null,
    options.headerShown ? options.header?.() : null,
    createElement(StackScreen, { query: searchParams.q, tab: searchParams.tab }),
  );
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
