import type { Href } from 'expo-router';

export type BottomTabItem = {
  key: string;
  routeName: string;
  title: string;
  icon: string;
  href: Href;
};

export const BOTTOM_TAB_ITEMS: BottomTabItem[] = [
  { key: 'home', routeName: 'index', title: '홈', icon: '⌂', href: '/(tabs)' },
  { key: 'search', routeName: 'search', title: '검색', icon: '⌕', href: '/(tabs)/search' },
  { key: 'compose', routeName: 'compose', title: '글쓰기', icon: '✎', href: '/(tabs)/compose' },
  {
    key: 'notifications',
    routeName: 'notifications',
    title: '알림',
    icon: '◉',
    href: '/(tabs)/notifications',
  },
  { key: 'menu', routeName: 'menu', title: '메뉴', icon: '≡', href: '/(tabs)/menu' },
];

const HIDDEN_ROUTE_PREFIXES = ['/post/', '/auth/'];

export function shouldHideBottomTab(pathname: string): boolean {
  if (!pathname) {
    return false;
  }

  return HIDDEN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
