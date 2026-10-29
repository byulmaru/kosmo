import type { ReactElement, RefObject } from 'react';
import type { View } from 'react-native';

export type NavigationChromePlatform = 'android' | 'ios' | 'web';

export type NavigationDestination =
  | 'bookmarks'
  | 'compose'
  | 'feedback'
  | 'followRequests'
  | 'home'
  | 'notifications'
  | 'postRequests'
  | 'profile'
  | 'search'
  | 'settings';

export type NavigationProfile = Readonly<{
  imageUri?: string | null;
  label: string;
}>;

export function getBottomTabBarContentHeight(platform: string): number {
  return platform === 'web' ? 80 : 56;
}

export type BottomTabDestination = Extract<
  NavigationDestination,
  'compose' | 'home' | 'notifications' | 'profile' | 'search'
>;

export type BottomTabBarProps = {
  composeControlRef?: RefObject<View | null>;
  currentDestination?: BottomTabDestination | null;
  onNavigate: (destination: BottomTabDestination) => void;
  platform?: NavigationChromePlatform;
  profile?: NavigationProfile | null;
  renderControl?: (props: BottomTabBarRenderControlProps) => ReactElement;
  safeAreaBottom?: number;
  unreadNotificationCount?: number | null;
};

export type BottomTabBarRenderControlProps = Readonly<{
  children: ReactElement;
  destination: BottomTabDestination;
  disabled: boolean;
  selected: boolean;
}>;

export function getUnreadNotificationAccessibilityLabel(count: number | null | undefined): string {
  return count && count > 0 ? `알림, 읽지 않은 알림 ${count}개` : '알림';
}
