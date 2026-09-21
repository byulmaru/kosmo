import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const routerActions: unknown[] = [];
let changeTab: ((value: string) => void) | undefined;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  useLocalSearchParams: () => ({ q: 'kosmo', tab: 'popular' }),
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
  TextInput: 'TextInput',
  useWindowDimensions: () => ({ height: 844, width: 390 }),
  View: 'View',
});
mockModule('react-relay', { graphql: () => ({}) });
mockModule('@/analytics/client', { trackAnalytics: () => undefined });
mockModule('@/components/PageHeader', { PageHeader: () => null });
mockModule('@/components/profile/ProfileListItem', { ProfileListItem: () => null });
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
mockModule('@/components/ui/IconButton', { IconButton: () => null });
mockModule('@/components/ui/SearchToolbar', { SearchToolbar: () => null });
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
  readRecentSearches: async () => [],
  writeRecentSearches: async () => undefined,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ surface: '#fff', text: '#111', textSecondary: '#777' }),
});

let SearchScreen: ComponentType;

before(async () => {
  ({ default: SearchScreen } = await import('../../app/(tabs)/(protected)/search'));
});

test('Native 검색 탭 변경은 새 Stack 화면을 쌓지 않는다', async () => {
  await act(async () => {
    create(createElement(SearchScreen));
  });
  assert.ok(changeTab);

  await act(async () => changeTab?.('latest'));

  assert.deepEqual(routerActions, [{ mode: 'setParams', params: { tab: 'latest' } }]);
});
