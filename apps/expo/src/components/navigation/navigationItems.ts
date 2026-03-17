import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type NavigationItem = {
  href: `/${string}` | '/';
  translationKey: 'home' | 'search' | 'compose' | 'notifications' | 'profile';
  icon: ComponentProps<typeof Ionicons>['name'];
  activeIcon: ComponentProps<typeof Ionicons>['name'];
};

export const navigationItems: NavigationItem[] = [
  {
    href: '/',
    translationKey: 'home',
    icon: 'home-outline',
    activeIcon: 'home',
  },
  {
    href: '/search',
    translationKey: 'search',
    icon: 'search-outline',
    activeIcon: 'search',
  },
  {
    href: '/compose',
    translationKey: 'compose',
    icon: 'add-circle-outline',
    activeIcon: 'add-circle',
  },
  {
    href: '/notifications',
    translationKey: 'notifications',
    icon: 'notifications-outline',
    activeIcon: 'notifications',
  },
  {
    href: '/profile',
    translationKey: 'profile',
    icon: 'person-outline',
    activeIcon: 'person',
  },
];
