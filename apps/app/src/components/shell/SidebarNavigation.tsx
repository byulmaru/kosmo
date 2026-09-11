import { usePathname } from 'expo-router';
import { cloneElement } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { SidebarNavigation as SidebarNavigationPresentation } from '@/components/ui/SidebarNavigation';
import { useLogout } from '@/session/logout';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, space } from '@/theme/tokens';
import { useNavigationGuard } from './NavigationGuardContext';
import { NavigationLink } from './NavigationLink';
import { ProfileSwitcher } from './ProfileSwitcher';
import { isSettingsRoute, isTimelineRoute } from './shellLayout';
import type { Href, LinkProps } from 'expo-router';
import type { ReactElement } from 'react';
import type { NavigationDestination } from '@/components/ui/navigationChrome';
import type { SidebarNavigationRenderControlProps } from '@/components/ui/SidebarNavigation';
import type { SidebarNavigation_query$key } from './__generated__/SidebarNavigation_query.graphql';

const SidebarNavigationFragment = graphql`
  fragment SidebarNavigation_query on Query {
    ...ProfileSwitcher_query
    currentSession {
      id
      selectedProfile {
        id
        relativeHandle
        unreadNotificationCount
        displayName
        avatar {
          id
          url
        }
      }
    }
  }
`;

type Props = {
  compact?: boolean;
  onComposeOpen?: () => void;
  feedbackActive?: boolean;
  onFeedbackOpen?: () => void;
  onHomeReselect?: () => void;
  onNavigate?: () => void;
  onSwitcherOpenChange?: (open: boolean) => void;
  query: SidebarNavigation_query$key;
  surface?: 'desktop' | 'drawer';
  switcherOpen?: boolean;
};

const hrefs: Partial<Record<NavigationDestination, Href>> = {
  bookmarks: '/bookmarks',
  compose: '/compose',
  feedback: '/feedback',
  followRequests: '/follow-requests',
  home: '/home',
  notifications: '/notifications',
  search: '/search',
  settings: '/settings',
};

export function SidebarNavigation({
  compact = false,
  onComposeOpen,
  feedbackActive = false,
  onFeedbackOpen,
  onHomeReselect,
  onNavigate,
  onSwitcherOpenChange,
  query,
  surface = 'desktop',
  switcherOpen,
}: Props) {
  const theme = useTheme();
  const pathname = usePathname();
  const { request: requestNavigation } = useNavigationGuard();
  const { error: logoutError, logout, pending: logoutPending } = useLogout();
  const data = useFragment(SidebarNavigationFragment, query);
  const profile = data.currentSession?.selectedProfile ?? null;
  const unreadNotificationCount = profile?.unreadNotificationCount ?? null;
  const profileHref = profile ? (`/${profile.relativeHandle}` as Href) : undefined;
  const feedbackRouteActive = pathname === '/feedback';
  const feedbackUsesOverlay = Platform.OS === 'web' && !feedbackRouteActive;
  const currentDestination = feedbackActive
    ? 'feedback'
    : getCurrentDestination(pathname, profileHref);
  const handleLogout = () => {
    if (!requestNavigation(logout)) {
      logout();
    }
  };
  const renderControl = ({
    children,
    destination,
    onPress,
    selected,
  }: SidebarNavigationRenderControlProps): ReactElement => {
    if (destination === 'feedback' && feedbackUsesOverlay) {
      return cloneElement(
        children as ReactElement<{ accessibilityRole?: 'button'; onPress?: () => void }>,
        {
          accessibilityRole: 'button',
          onPress: onFeedbackOpen,
        },
      );
    }

    if (destination === 'compose' && onComposeOpen) {
      return cloneElement(
        children as ReactElement<{ accessibilityRole?: 'button'; onPress?: () => void }>,
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

    const childControl = children as ReactElement<{
      accessibilityRole?: 'button' | 'link' | 'menuitem';
      onPress?: NonNullable<LinkProps['onPress']>;
      role?: 'menuitem';
    }>;
    const linkControl = cloneElement(childControl, {
      accessibilityRole:
        childControl.props.accessibilityRole === 'menuitem' ||
        childControl.props.role === 'menuitem'
          ? 'menuitem'
          : 'link',
      onPress: destination === 'settings' ? onPress : undefined,
    });

    return (
      <NavigationLink
        current={destination === 'home' ? selected : undefined}
        href={href}
        key={destination}
        onCurrentNavigate={destination === 'home' ? onHomeReselect : undefined}
        onNavigate={onNavigate}
        primary
      >
        {linkControl}
      </NavigationLink>
    );
  };

  const switcherSurface = compact ? 'compact' : surface === 'desktop' ? 'full' : 'drawer';
  const nativeDrawerSurface = Platform.OS !== 'web' && surface === 'drawer';

  return (
    <View
      style={[
        styles.root,
        compact
          ? styles.compactRoot
          : nativeDrawerSurface
            ? styles.nativeDrawerRoot
            : styles.fullRoot,
        {
          backgroundColor: surface === 'drawer' ? theme.backgroundElevated : theme.backgroundCanvas,
        },
      ]}
    >
      <ProfileSwitcher
        onNavigate={onNavigate}
        onOpenChange={onSwitcherOpenChange}
        open={switcherOpen}
        query={data}
        surface={switcherSurface}
      />
      <ScrollView
        contentContainerStyle={styles.navigationContent}
        style={[
          styles.navigationArea,
          compact ? styles.compactNavigationArea : styles.wideNavigationArea,
          !compact ? { borderColor: theme.borderSubtle } : undefined,
        ]}
        testID={surface === 'drawer' ? 'mobile-sidebar-scroll' : undefined}
      >
        <SidebarNavigationPresentation
          currentDestination={currentDestination}
          logoutError={logoutError}
          logoutPending={logoutPending}
          onLogout={handleLogout}
          onNavigate={() => undefined}
          presentation={surface === 'drawer' ? 'drawer' : compact ? 'compact' : 'full'}
          profile={profile ? { imageUri: profile.avatar?.url, label: profile.displayName } : null}
          renderControl={renderControl}
          showFeedback={data.currentSession !== null}
          unreadNotificationCount={unreadNotificationCount}
        />
      </ScrollView>
    </View>
  );
}

function getCurrentDestination(
  pathname: string,
  profileHref: Href | undefined,
): NavigationDestination | null {
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
  if (pathname === '/follow-requests') {
    return 'followRequests';
  }
  if (pathname === '/bookmarks') {
    return 'bookmarks';
  }
  if (isSettingsRoute(pathname)) {
    return 'settings';
  }
  if (pathname === '/feedback') {
    return 'feedback';
  }
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  compactRoot: { alignItems: 'center', paddingTop: space[24], width: 80 },
  fullRoot: { width: 320 },
  nativeDrawerRoot: { width: '100%' },
  navigationArea: { flex: 1, minHeight: 0 },
  compactNavigationArea: { marginTop: space[8] },
  wideNavigationArea: { borderTopWidth: borderWidths[1] },
  navigationContent: { flexGrow: 1, width: '100%' },
});
