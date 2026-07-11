import { Link, usePathname } from 'expo-router';
import { Bell, House, Pencil, Search } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { graphql, useFragment } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import type { BottomTabBar_profile$key } from './__generated__/BottomTabBar_profile.graphql';

const BottomTabBarFragment = graphql`
  fragment BottomTabBar_profile on Profile {
    handle
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
  { href: '/compose', Icon: Pencil, label: '글쓰기' },
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
  const tabs: Tab[] = [
    ...baseTabs,
    {
      href: profile ? (`/@${profile.handle}` as Href) : undefined,
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
            accessibilityLabel={tab.label}
            accessibilityRole={tab.href ? 'link' : 'button'}
            accessibilityState={{ disabled: !tab.href }}
            disabled={!tab.href}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: active ? theme.primary : 'transparent',
                opacity: !tab.href ? 0.45 : pressed ? 0.7 : 1,
              },
            ]}
          >
            {tab.label === '프로필' ? (
              <Avatar label={profile?.displayName ?? '프로필'} size={24} />
            ) : tab.Icon ? (
              <tab.Icon
                color={active ? theme.text : theme.textSecondary}
                size={24}
                strokeWidth={2}
              />
            ) : null}
            <Text style={[styles.label, { color: active ? theme.text : theme.textSecondary }]}>
              {tab.label}
            </Text>
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
  label: { fontFamily: 'SUIT', fontWeight: '700', ...typography.xsm },
});
