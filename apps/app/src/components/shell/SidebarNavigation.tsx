import { usePathname } from 'expo-router';
import {
  Bell,
  Bookmark,
  House,
  Mail,
  PenLine,
  Search,
  Settings as SettingsIcon,
  UserRound,
  UserRoundPlus,
} from 'lucide-react-native';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, textStyles } from '@/theme/tokens';
import { LogoutControl } from './LogoutControl';
import { NavigationLink } from './NavigationLink';
import { ProfileSwitcher } from './ProfileSwitcher';
import { isSettingsRoute, isTimelineRoute } from './shellLayout';
import { UnreadNotificationBadge } from './UnreadNotificationBadge';
import { useUnreadNotificationCount } from './UnreadNotificationBadgeController';
import { getUnreadNotificationAccessibilityLabel } from './unreadNotificationBadgeState';
import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import type { SidebarNavigation_query$key } from './__generated__/SidebarNavigation_query.graphql';

const SidebarNavigationFragment = graphql`
  fragment SidebarNavigation_query on Query {
    ...ProfileSwitcher_query
    currentSession {
      id
      selectedProfile {
        id
        relativeHandle
      }
    }
  }
`;

type RouteNavigationItem = {
  href: Href;
  Icon: LucideIcon;
  label: string;
  profile?: false;
};

type ProfileNavigationItem = {
  Icon: LucideIcon;
  label: string;
  profile: true;
};

type NavigationItem = ProfileNavigationItem | RouteNavigationItem;

const navigation: NavigationItem[] = [
  { href: '/home', Icon: House, label: '홈' },
  { href: '/search', Icon: Search, label: '검색' },
  { href: '/notifications', Icon: Bell, label: '알림' },
  { Icon: UserRound, label: '프로필', profile: true },
  { href: '/follow-requests', Icon: UserRoundPlus, label: '팔로워 요청' },
  { href: '/bookmarks', Icon: Bookmark, label: '북마크' },
  { href: '/settings', Icon: SettingsIcon, label: '설정' },
];

type Props = {
  compact?: boolean;
  onFeedbackOpen?: () => void;
  onHomeReselect?: () => void;
  onNavigate?: () => void;
  onSwitcherOpenChange?: (open: boolean) => void;
  query: SidebarNavigation_query$key;
  surface?: 'desktop' | 'drawer';
  switcherOpen?: boolean;
};

export function SidebarNavigation({
  compact = false,
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
  const data = useFragment(SidebarNavigationFragment, query);
  const unreadNotificationCount = useUnreadNotificationCount();
  const profile = data.currentSession?.selectedProfile ?? null;
  const feedbackActive = pathname === '/feedback';
  const feedbackUsesOverlay = Platform.OS === 'web' && !feedbackActive;

  const resolveItem = (item: NavigationItem) => {
    if (item.profile) {
      const href = profile ? (`/${profile.relativeHandle}` as Href) : undefined;
      return { active: Boolean(href && pathname === href), href };
    }

    return {
      active:
        item.href === '/home'
          ? isTimelineRoute(pathname)
          : item.href === '/settings'
            ? isSettingsRoute(pathname)
            : pathname === item.href,
      href: item.href,
    };
  };

  const switcherSurface = compact ? 'compact' : surface === 'desktop' ? 'full' : 'drawer';

  return (
    <View
      style={[
        styles.root,
        compact ? styles.compactRoot : styles.fullRoot,
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
        contentContainerStyle={[
          styles.navigationContent,
          compact && styles.compactNavigationContent,
        ]}
        style={[
          styles.navigationArea,
          compact && styles.compactNavigationArea,
          { borderColor: theme.borderSubtle },
        ]}
        testID={surface === 'drawer' ? 'mobile-sidebar-scroll' : undefined}
      >
        <View accessibilityLabel="주요 메뉴" role="navigation" style={styles.navigation}>
          {navigation.map((item) => {
            const { active, href } = resolveItem(item);
            const current = href === '/home' ? pathname === href : active;
            const control = (
              <Pressable
                aria-current={current ? 'page' : undefined}
                accessibilityLabel={
                  item.label === '알림'
                    ? getUnreadNotificationAccessibilityLabel(unreadNotificationCount)
                    : item.label
                }
                accessibilityRole={href ? 'link' : 'button'}
                accessibilityState={{ disabled: !href }}
                disabled={!href}
                style={StyleSheet.flatten([
                  styles.item,
                  compact && styles.compactItem,
                  {
                    backgroundColor: active ? theme.stateSelectedSurface : 'transparent',
                    opacity: href ? 1 : 0.5,
                  },
                ])}
              >
                {({ pressed }) => (
                  <>
                    <View style={styles.iconWithBadge}>
                      <item.Icon
                        color={theme.foregroundPrimary}
                        size={20}
                        strokeWidth={2}
                        style={pressed && styles.pressedContent}
                      />
                      {item.label === '알림' ? (
                        <UnreadNotificationBadge count={unreadNotificationCount} />
                      ) : null}
                    </View>
                    {!compact ? (
                      <Text
                        style={[
                          styles.itemLabel,
                          active && styles.activeItemLabel,
                          pressed && styles.pressedContent,
                          { color: theme.foregroundPrimary },
                        ]}
                      >
                        {item.label}
                      </Text>
                    ) : null}
                  </>
                )}
              </Pressable>
            );

            return href ? (
              <NavigationLink
                href={href}
                key={item.label}
                onCurrentNavigate={href === '/home' ? onHomeReselect : undefined}
                onNavigate={onNavigate}
                primary
              >
                {control}
              </NavigationLink>
            ) : (
              <View key={item.label}>{control}</View>
            );
          })}
          {compact ? (
            <NavigationLink href="/compose" onNavigate={onNavigate} primary>
              <Pressable
                accessibilityLabel="글쓰기"
                accessibilityRole="link"
                style={StyleSheet.flatten([
                  styles.compose,
                  compact && styles.compactCompose,
                  { backgroundColor: theme.actionPrimaryBase },
                ])}
              >
                {({ pressed }) => (
                  <>
                    <PenLine
                      color={theme.actionPrimaryOnBase}
                      size={20}
                      strokeWidth={2}
                      style={pressed && styles.pressedContent}
                    />
                  </>
                )}
              </Pressable>
            </NavigationLink>
          ) : null}
        </View>

        <View
          style={[
            styles.footer,
            compact && styles.compactFooter,
            { borderColor: theme.borderSubtle },
          ]}
        >
          {data.currentSession ? (
            feedbackUsesOverlay ? (
              <Pressable
                accessibilityLabel="피드백 보내기"
                accessibilityRole="button"
                onPress={onFeedbackOpen}
                style={StyleSheet.flatten([
                  styles.footerItem,
                  compact && styles.compactItem,
                  styles.feedbackFooterItem,
                ])}
              >
                <Mail color={theme.foregroundSecondary} size={20} strokeWidth={2} />
                {!compact ? (
                  <Text
                    style={[
                      styles.footerLabel,
                      styles.footerLabelGrow,
                      { color: theme.foregroundPrimary },
                    ]}
                  >
                    피드백 보내기
                  </Text>
                ) : null}
              </Pressable>
            ) : (
              <NavigationLink href="/feedback" onNavigate={onNavigate}>
                <Pressable
                  aria-current={feedbackActive ? 'page' : undefined}
                  accessibilityLabel="피드백 보내기"
                  accessibilityRole="link"
                  accessibilityState={{ selected: feedbackActive }}
                  style={StyleSheet.flatten([
                    styles.footerItem,
                    compact && styles.compactItem,
                    styles.feedbackFooterItem,
                    {
                      backgroundColor: feedbackActive ? theme.stateSelectedSurface : 'transparent',
                    },
                  ])}
                >
                  <Mail
                    color={feedbackActive ? theme.foregroundPrimary : theme.foregroundSecondary}
                    size={20}
                    strokeWidth={2}
                  />
                  {!compact ? (
                    <Text
                      style={[
                        styles.footerLabel,
                        styles.footerLabelGrow,
                        feedbackActive && styles.activeItemLabel,
                        { color: theme.foregroundPrimary },
                      ]}
                    >
                      피드백 보내기
                    </Text>
                  ) : null}
                </Pressable>
              </NavigationLink>
            )
          ) : null}
          {compact ? (
            <LogoutControl compact style={[styles.footerItem, styles.compactItem]} />
          ) : (
            <LogoutControl />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  iconWithBadge: { position: 'relative' },
  compactRoot: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.lg,
    width: 80,
  },
  fullRoot: { width: 320 },
  navigationArea: {
    borderTopWidth: 1,
    flex: 1,
    minHeight: 0,
    padding: spacing.lg,
    position: 'relative',
    zIndex: 0,
  },
  navigationContent: { flexGrow: 1, width: 264 },
  compactNavigationArea: { borderTopWidth: 0, padding: 0, width: '100%' },
  compactNavigationContent: { alignItems: 'center', width: '100%' },
  navigation: { gap: spacing.xs, width: '100%' },
  item: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.md,
    height: 45,
    minHeight: 45,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    width: '100%',
  },
  compactItem: {
    height: 44,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 44,
  },
  itemLabel: { fontFamily: 'SUIT', fontSize: 16, lineHeight: 21 },
  activeItemLabel: { fontWeight: '600' },
  pressedContent: { opacity: 0.7 },
  compose: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 45,
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: 45,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  compactCompose: {
    borderRadius: radii.full,
    height: 44,
    minHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 44,
  },
  footer: { borderTopWidth: 1, marginTop: 'auto', paddingTop: spacing.xs, width: '100%' },
  compactFooter: { borderTopWidth: 0 },
  footerItem: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.md,
    height: 45,
    minHeight: 45,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  feedbackFooterItem: { height: 48, minHeight: 48 },
  footerLabel: textStyles.uiCopyM,
  footerLabelGrow: { flex: 1 },
});
