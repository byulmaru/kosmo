import { usePathname } from 'expo-router';
import { cloneElement } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { graphql, useFragment } from 'react-relay';
import { BottomTabBar as BottomTabBarPresentation } from '@/components/ui/BottomTabBar';
import { NavigationLink } from './NavigationLink';
import { isTimelineRoute } from './shellLayout';
import type { Href, LinkProps } from 'expo-router';
import type { ReactElement } from 'react';
import type {
  BottomTabBarRenderControlProps,
  BottomTabDestination,
} from '@/components/ui/navigationChrome';
import type { BottomTabBar_profile$key } from './__generated__/BottomTabBar_profile.graphql';

const BottomTabBarFragment = graphql`
  fragment BottomTabBar_profile on Profile {
    unreadNotificationCount
    relativeHandle
    displayName
    avatar {
      id
      url
    }
  }
`;

type Props = {
  onHomeReselect?: () => void;
  profile?: BottomTabBar_profile$key | null;
};

const hrefs: Record<BottomTabDestination, Href | undefined> = {
  compose: '/compose',
  home: '/home',
  notifications: '/notifications',
  profile: undefined,
  search: '/search',
};

export function BottomTabBar({ onHomeReselect, profile: profileKey }: Props) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const profile = useFragment(BottomTabBarFragment, profileKey ?? null);
  const unreadNotificationCount = profile?.unreadNotificationCount ?? null;
  const profileHref = profile ? (`/${profile.relativeHandle}` as Href) : undefined;
  const currentDestination = getCurrentDestination(pathname, profileHref);
  const renderControl = ({
    children,
    destination,
    selected,
  }: BottomTabBarRenderControlProps): ReactElement => {
    const href = destination === 'profile' ? profileHref : hrefs[destination];
    if (!href) {
      return children;
    }

    const linkControl = cloneElement(
      children as ReactElement<{
        accessibilityRole?: 'button' | 'link';
        onPress?: NonNullable<LinkProps['onPress']>;
      }>,
      { accessibilityRole: 'link' },
    );

    return (
      <NavigationLink
        current={destination === 'home' ? selected : undefined}
        href={href}
        onCurrentNavigate={destination === 'home' ? onHomeReselect : undefined}
        primary
      >
        {linkControl}
      </NavigationLink>
    );
  };

  return (
    <BottomTabBarPresentation
      currentDestination={currentDestination}
      onNavigate={() => undefined}
      platform={Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android'}
      profile={
        profile
          ? {
              imageUri: profile.avatar?.url,
              label: profile.displayName,
            }
          : null
      }
      renderControl={renderControl}
      safeAreaBottom={insets.bottom}
      unreadNotificationCount={unreadNotificationCount}
    />
  );
}

function getCurrentDestination(
  pathname: string,
  profileHref: Href | undefined,
): BottomTabDestination | null {
  if (isTimelineRoute(pathname)) {
    return 'home';
  }
  if (pathname === '/search') {
    return 'search';
  }
  if (pathname === '/compose') {
    return 'compose';
  }
  if (pathname === '/notifications') {
    return 'notifications';
  }
  if (profileHref && pathname === profileHref) {
    return 'profile';
  }
  return null;
}
