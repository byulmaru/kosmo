import { usePathname, useRouter } from 'expo-router';
import { cloneElement } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { graphql, useFragment } from 'react-relay';
import { BottomTabBar as BottomTabBarPresentation } from '@/components/ui/BottomTabBar';
import {
  findTabStackToPopTarget,
  handleNativeTabPress,
  hasSelectedProfileRoute,
} from './nativeTabNavigation';
import { useNavigationGuard } from './NavigationGuardContext';
import { NavigationLink } from './NavigationLink';
import { useShellChrome } from './ShellChromeContext';
import { isTimelineRoute } from './shellLayout';
import type { Href, LinkProps, Tabs } from 'expo-router';
import type { ComponentProps, ReactElement } from 'react';
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
  onComposeOpen?: () => void;
  onHomeReselect?: () => void;
  profile?: BottomTabBar_profile$key | null;
};

type NativeTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const hrefs: Record<BottomTabDestination, Href | undefined> = {
  compose: undefined,
  home: '/home',
  notifications: '/notifications',
  profile: undefined,
  search: '/search',
};

export function isBottomTabDestination(href: Href) {
  return typeof href === 'string' && Object.values(hrefs).some((tabHref) => tabHref === href);
}

export function BottomTabBar({ onComposeOpen, onHomeReselect, profile: profileKey }: Props) {
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
    if (destination === 'compose' && onComposeOpen) {
      return cloneElement(
        children as ReactElement<{
          accessibilityRole?: 'button';
          onPress?: () => void;
        }>,
        {
          accessibilityRole: 'button',
          onPress: onComposeOpen,
        },
      );
    }

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
        navigationMode="switch"
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

export function NativeBottomTabBar({ navigation, state }: NativeTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const shellChrome = useShellChrome();
  const { request } = useNavigationGuard();
  const profile = useFragment(BottomTabBarFragment, shellChrome?.selectedProfile ?? null);
  const profileHref = profile
    ? ({
        pathname: '/(account)/[profileHandle]',
        params: { profileHandle: profile.relativeHandle },
      } as Href)
    : undefined;
  const selectedRoute = state.routes[state.index];
  const currentDestination = selectedRoute ? getNativeDestination(selectedRoute.name) : null;

  const renderControl = ({
    children,
    destination,
  }: BottomTabBarRenderControlProps): ReactElement => {
    const onPress = () => {
      if (destination === 'compose') {
        shellChrome?.openComposer?.();
        return;
      }

      const routeName = nativeRouteNames[destination];
      const routeIndex = state.routes.findIndex((route) => route.name === routeName);
      const route = state.routes[routeIndex];
      if (!route) {
        return;
      }

      const focused = state.index === routeIndex;
      const popTarget = findTabStackToPopTarget(route.state);
      const emitTabPress = () =>
        navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          .defaultPrevented;
      const navigateToTab = () => {
        if (
          destination === 'profile' &&
          profileHref &&
          !hasSelectedProfileRoute(route.state, profile?.relativeHandle ?? '')
        ) {
          router.navigate(profileHref);
          return;
        }

        navigation.navigate(route.name);
      };

      handleNativeTabPress({
        focused,
        stackIndex: popTarget ? 1 : 0,
        emitTabPress,
        navigateToTab,
        onReselect: () => {
          shellChrome?.reselectNativeTab?.(destination);
          if (destination === 'home') {
            shellChrome?.reselectHome();
          }
        },
        popToTop: () => {
          if (popTarget) {
            navigation.dispatch({ type: 'POP_TO_TOP', target: popTarget });
          }
        },
        requestNavigation: request,
      });
    };

    return cloneElement(
      children as ReactElement<{
        accessibilityRole?: 'button' | 'link';
        onPress?: () => void;
      }>,
      { accessibilityRole: 'button', onPress },
    );
  };

  return (
    <BottomTabBarPresentation
      currentDestination={currentDestination}
      onNavigate={() => undefined}
      platform="ios"
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
      unreadNotificationCount={profile?.unreadNotificationCount ?? null}
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
  if (pathname === '/notifications') {
    return 'notifications';
  }
  if (profileHref && pathname === profileHref) {
    return 'profile';
  }
  return null;
}

const nativeRouteNames: Record<Exclude<BottomTabDestination, 'compose'>, string> = {
  home: '(home)',
  notifications: '(notifications)',
  profile: '(account)',
  search: '(primary-search)',
};

function getNativeDestination(routeName: string): BottomTabDestination | null {
  const destination = Object.entries(nativeRouteNames).find(([, name]) => name === routeName)?.[0];
  return (destination as Exclude<BottomTabDestination, 'compose'> | undefined) ?? null;
}
