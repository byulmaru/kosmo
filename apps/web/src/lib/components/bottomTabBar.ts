export type BottomTabIcon = 'home' | 'search' | 'compose' | 'notifications' | 'profile';

export type BottomTabItem = {
  href?: string;
  label: string;
  icon: BottomTabIcon;
  disabled: boolean;
};

type BottomTabItemsOptions = {
  selectedProfileRelativeHandle?: string | null;
};

export const getBottomTabItems = ({
  selectedProfileRelativeHandle,
}: BottomTabItemsOptions): BottomTabItem[] => [
  { href: '/home', label: '홈', icon: 'home', disabled: false },
  { href: '/search', label: '검색', icon: 'search', disabled: false },
  { href: '/compose', label: '글쓰기', icon: 'compose', disabled: false },
  { href: '/notifications', label: '알림', icon: 'notifications', disabled: false },
  {
    href: selectedProfileRelativeHandle ? `/${selectedProfileRelativeHandle}` : undefined,
    label: '프로필',
    icon: 'profile',
    disabled: !selectedProfileRelativeHandle,
  },
];

export const isBottomTabActive = (tab: BottomTabItem, pathname: string) =>
  Boolean(tab.href && pathname === tab.href);
