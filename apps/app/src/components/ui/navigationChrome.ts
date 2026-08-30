export type NavigationChromePlatform = 'android' | 'ios' | 'web';

export type NavigationDestination =
  | 'bookmarks'
  | 'compose'
  | 'feedback'
  | 'followRequests'
  | 'home'
  | 'notifications'
  | 'profile'
  | 'search'
  | 'settings';

export type NavigationProfile = Readonly<{
  imageUri?: string | null;
  label: string;
}>;

export type BottomTabDestination = Extract<
  NavigationDestination,
  'compose' | 'home' | 'notifications' | 'profile' | 'search'
>;

export type BottomTabBarProps = {
  currentDestination?: BottomTabDestination | null;
  onNavigate: (destination: BottomTabDestination) => void;
  platform?: NavigationChromePlatform;
  profile?: NavigationProfile | null;
  safeAreaBottom?: number;
  unreadNotificationCount?: number | null;
};

export function getUnreadNotificationAccessibilityLabel(count: number | null | undefined): string {
  return count && count > 0 ? `알림, 읽지 않은 알림 ${count}개` : '알림';
}
