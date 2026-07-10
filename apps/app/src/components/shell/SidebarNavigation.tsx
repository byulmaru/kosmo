import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { ProfileSwitcher } from './ProfileSwitcher';
import type { SidebarNavigation_query$key } from './__generated__/SidebarNavigation_query.graphql';

const SidebarNavigationFragment = graphql`
  fragment SidebarNavigation_query on Query {
    ...ProfileSwitcher_query
    currentSession {
      selectedProfile {
        id
        handle
        displayName
        relativeHandle
        followingCount
        followersCount
      }
    }
  }
`;

const navigation = [
  { icon: '⌂', label: '홈', href: '/home' },
  { icon: '⌕', label: '검색', href: '/search' },
  { icon: '♢', label: '알림', href: '/notifications' },
  { icon: '☰', label: '메뉴', href: '/menu' },
] as const;

type Props = {
  compact?: boolean;
  onNavigate?: () => void;
  query: SidebarNavigation_query$key;
};

export function SidebarNavigation({ compact = false, onNavigate, query }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const data = useFragment(SidebarNavigationFragment, query);
  const profile = data.currentSession?.selectedProfile ?? null;
  const items = profile
    ? [...navigation, { icon: '●', label: '프로필', href: `/@${profile.handle}` as const }]
    : navigation;

  return (
    <View style={[styles.root, compact && styles.compact]}>
      <ProfileSwitcher compact={compact} query={data} />
      {!compact && profile ? (
        <View style={styles.profileMeta}>
          <Text style={[styles.profileHandle, { color: theme.textSecondary }]}>
            {profile.relativeHandle}
          </Text>
          <View style={styles.counts}>
            <Pressable onPress={() => router.push(`/@${profile.handle}/following`)}>
              <Text style={[styles.count, { color: theme.text }]}>
                {profile.followingCount} 팔로잉
              </Text>
            </Pressable>
            <Pressable onPress={() => router.push(`/@${profile.handle}/followers`)}>
              <Text style={[styles.count, { color: theme.text }]}>
                {profile.followersCount} 팔로워
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View accessibilityLabel="주요 메뉴" accessibilityRole="menu" style={styles.navigation}>
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Pressable
              accessibilityRole="menuitem"
              accessibilityState={{ selected: active }}
              key={item.label}
              onPress={() => {
                router.push(item.href);
                onNavigate?.();
              }}
              style={({ pressed }) => [
                styles.item,
                compact && styles.compactItem,
                {
                  backgroundColor: active ? theme.surface : 'transparent',
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
            >
              <Text style={[styles.icon, { color: theme.text }]}>{item.icon}</Text>
              {!compact ? (
                <Text style={[styles.itemLabel, { color: theme.text }]}>{item.label}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityLabel="글쓰기"
        accessibilityRole="button"
        onPress={() => {
          router.push('/compose');
          onNavigate?.();
        }}
        style={({ pressed }) => [
          styles.compose,
          { backgroundColor: theme.primary, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={styles.composeLabel}>{compact ? '＋' : '＋ 글쓰기'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.lg, padding: spacing.lg, width: 320 },
  compact: { alignItems: 'center', paddingHorizontal: spacing.sm, width: 80 },
  profileMeta: { gap: spacing.sm },
  profileHandle: { fontFamily: 'SUIT', ...typography.sm },
  counts: { flexDirection: 'row', gap: spacing.md },
  count: { fontFamily: 'SUIT', ...typography.sm },
  navigation: { gap: spacing.xs },
  item: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  compactItem: { justifyContent: 'center', paddingHorizontal: 0, width: 44 },
  icon: { fontFamily: 'SUIT', fontSize: 22, width: 24 },
  itemLabel: { fontFamily: 'SUIT', fontWeight: '600', ...typography.md },
  compose: {
    alignItems: 'center',
    borderRadius: radii.full,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  composeLabel: { color: '#111111', fontFamily: 'SUIT', fontWeight: '800', ...typography.md },
});
