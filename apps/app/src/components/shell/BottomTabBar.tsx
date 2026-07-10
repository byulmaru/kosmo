import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { graphql, useFragment } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { BottomTabBar_profile$key } from './__generated__/BottomTabBar_profile.graphql';

const BottomTabBarFragment = graphql`
  fragment BottomTabBar_profile on Profile {
    handle
    displayName
  }
`;

const baseTabs = [
  { icon: '⌂', label: '홈', href: '/home' },
  { icon: '⌕', label: '검색', href: '/search' },
  { icon: '＋', label: '글쓰기', href: '/compose' },
  { icon: '♢', label: '알림', href: '/notifications' },
] as const;

export function BottomTabBar({
  profile: profileKey,
}: {
  profile?: BottomTabBar_profile$key | null;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const profile = useFragment(BottomTabBarFragment, profileKey ?? null);
  const tabs = profile
    ? [...baseTabs, { icon: '', label: '프로필', href: `/@${profile.handle}` as const }]
    : baseTabs;

  return (
    <View
      accessibilityLabel="주요 메뉴"
      accessibilityRole="tablist"
      style={[
        styles.root,
        { backgroundColor: theme.card, borderColor: theme.border, paddingBottom: insets.bottom },
      ]}
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Pressable
            aria-selected={active}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={tab.label}
            onPress={() => router.push(tab.href)}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: active ? theme.primary : 'transparent',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            {tab.label === '프로필' && profile ? (
              <Avatar label={profile.displayName} size={24} />
            ) : (
              <Text style={[styles.icon, { color: theme.text }]}>{tab.icon}</Text>
            )}
            <Text style={[styles.label, { color: active ? '#111111' : theme.textSecondary }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderTopWidth: 1, flexDirection: 'row' },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: 1,
    justifyContent: 'center',
    minHeight: 58,
    paddingVertical: spacing.xs,
  },
  icon: { fontFamily: 'SUIT', fontSize: 24, lineHeight: 26 },
  label: { fontFamily: 'SUIT', fontWeight: '700', ...typography.xsm },
});
