import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type NavigationItem = {
  href: `/${string}` | '/';
  label: string;
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  activeIcon: ComponentProps<typeof Ionicons>['name'];
};

export const navigationItems: NavigationItem[] = [
  {
    href: '/',
    label: '홈',
    title: 'Home',
    icon: 'home-outline',
    activeIcon: 'home',
  },
  {
    href: '/search',
    label: '탐색',
    title: 'Search',
    icon: 'search-outline',
    activeIcon: 'search',
  },
  {
    href: '/compose',
    label: '작성',
    title: 'Compose',
    icon: 'add-circle-outline',
    activeIcon: 'add-circle',
  },
  {
    href: '/notifications',
    label: '알림',
    title: 'Notifications',
    icon: 'notifications-outline',
    activeIcon: 'notifications',
  },
  {
    href: '/profile',
    label: '메뉴',
    title: 'Menu',
    icon: 'grid-outline',
    activeIcon: 'grid',
  },
];
