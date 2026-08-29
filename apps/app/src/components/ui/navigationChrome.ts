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
  unread?: boolean;
};
