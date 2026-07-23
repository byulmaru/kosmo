import { Link, usePathname } from 'expo-router';
import { Bell, House, PenLine, Search } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { graphql, useFragment } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { UnreadNotificationBadge } from './UnreadNotificationBadge';
import { useUnreadNotificationCount } from './UnreadNotificationBadgeController';
import { getUnreadNotificationAccessibilityLabel } from './unreadNotificationBadgeState';
import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import type { BottomTabBar_profile$key } from './__generated__/BottomTabBar_profile.graphql';

const BottomTabBarFragment = graphql`
  fragment BottomTabBar_profile on Profile {
    relativeHandle
    displayName
  }
`;

type Tab = {
  href?: Href;
  Icon?: LucideIcon;
  label: string;
};

const baseTabs: Tab[] = [
  { href: '/home', Icon: House, label: '홈' },
  { href: '/search', Icon: Search, label: '검색' },
  { href: '/compose', Icon: PenLine, label: '글쓰기' },
  { href: '/notifications', Icon: Bell, label: '알림' },
];

export function BottomTabBar({
  profile: profileKey,
}: {
  profile?: BottomTabBar_profile$key | null;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const profile = useFragment(BottomTabBarFragment, profileKey ?? null);
  const unreadNotificationCount = useUnreadNotificationCount();
  const tabs: Tab[] = [
    ...baseTabs,
    {
      href: profile ? (`/${profile.relativeHandle}` as Href) : undefined,
      label: '프로필',
    },
  ];

  return (
    <View
      accessibilityLabel="주요 메뉴"
      role="navigation"
      style={[
        styles.root,
        { backgroundColor: theme.card, borderColor: theme.border, paddingBottom: insets.bottom },
      ]}
    >
      {tabs.map((tab) => {
        const active = Boolean(tab.href && pathname === tab.href);
        const content = (
          <Pressable
            aria-current={active ? 'page' : undefined}
            accessibilityLabel={
              tab.label === '알림'
                ? getUnreadNotificationAccessibilityLabel(unreadNotificationCount)
                : tab.label
            }
            accessibilityRole={tab.href ? 'link' : 'button'}
            accessibilityState={{ disabled: !tab.href }}
            disabled={!tab.href}
            style={StyleSheet.flatten([
              styles.item,
              {
                backgroundColor: active ? theme.primary : 'transparent',
                opacity: tab.href ? 1 : 0.45,
              },
            ])}
          >
            {({ pressed }) => (
              <>
                {tab.label === '프로필' ? (
                  <Avatar
                    label={profile?.displayName ?? '프로필'}
                    size={24}
                    style={pressed && styles.pressedContent}
                  />
                ) : tab.Icon ? (
                  <View style={styles.iconWithBadge}>
                    <tab.Icon
                      color={active ? theme.text : theme.textSecondary}
                      size={24}
                      strokeWidth={2}
                      style={pressed && styles.pressedContent}
                    />
                    {tab.label === '알림' ? (
                      <UnreadNotificationBadge count={unreadNotificationCount} />
                    ) : null}
                  </View>
                ) : null}
                <Text
                  style={[
                    styles.label,
                    pressed && styles.pressedContent,
                    { color: active ? theme.text : theme.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </>
            )}
          </Pressable>
        );

        return tab.href ? (
          <Link asChild href={tab.href} key={tab.label}>
            {content}
          </Link>
        ) : (
          <View key={tab.label} style={styles.disabledItem}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderTopWidth: 1, flexDirection: 'row' },
  disabledItem: { flex: 1 },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingVertical: spacing.xs,
  },
  iconWithBadge: { position: 'relative' },
  label: { fontFamily: 'SUIT', fontWeight: '700', ...typography.xsm },
  pressedContent: { opacity: 0.7 },
});
