import { Link, usePathname } from 'expo-router';
import {
  Bell,
  Bookmark,
  ChevronDown,
  House,
  LogOut,
  Pencil,
  Search,
  Settings,
  UserRound,
  UserRoundPlus,
} from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { ProfileSwitcher } from './ProfileSwitcher';
import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import type { ViewStyle } from 'react-native';
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
    me {
      id
      profiles {
        id
      }
    }
  }
`;

type NavigationItem = {
  href: Href;
  Icon: LucideIcon;
  label: string;
  profile?: boolean;
};

const navigation: NavigationItem[] = [
  { href: '/home', Icon: House, label: '홈' },
  { href: '/search', Icon: Search, label: '검색' },
  { href: '/notifications', Icon: Bell, label: '알림' },
  { href: '/menu', Icon: UserRound, label: '프로필', profile: true },
  { href: '/menu', Icon: Bookmark, label: '북마크' },
  { href: '/menu', Icon: UserRoundPlus, label: '팔로워 요청' },
  { href: '/menu', Icon: Settings, label: '프로필 설정' },
];

const countFormatter = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  notation: 'compact',
});

const webCover = {
  backgroundImage:
    'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.9), transparent 35%), linear-gradient(135deg, rgba(17,17,17,0.14), transparent), linear-gradient(135deg, #e4e4e7, #f4f4f5, #d4d4d8)',
  filter: 'blur(1px)',
} as unknown as ViewStyle;

const avatarShadow = {
  boxShadow: '1px 1px 2px rgba(0, 0, 0, 0.25)',
} as ViewStyle;

type Props = {
  compact?: boolean;
  onNavigate?: () => void;
  onSwitcherOpenChange?: (open: boolean) => void;
  query: SidebarNavigation_query$key;
  surface?: 'desktop' | 'drawer';
  switcherOpen?: boolean;
};

export function SidebarNavigation({
  compact = false,
  onNavigate,
  onSwitcherOpenChange,
  query,
  surface = 'desktop',
  switcherOpen,
}: Props) {
  const theme = useTheme();
  const pathname = usePathname();
  const data = useFragment(SidebarNavigationFragment, query);
  const profile = data.currentSession?.selectedProfile ?? null;
  const hasProfiles = (data.me?.profiles?.length ?? 0) > 0;

  const resolveItem = (item: NavigationItem) => {
    if (!item.profile) {
      return { active: pathname === item.href && item.href !== '/menu', href: item.href };
    }

    const href = profile ? (`/@${profile.handle}` as Href) : undefined;
    return { active: Boolean(href && pathname === href), href };
  };

  const profileSwitcher = (
    <ProfileSwitcher
      compact={compact}
      onOpenChange={onSwitcherOpenChange}
      open={switcherOpen}
      query={data}
      showAvatar={compact}
    />
  );

  return (
    <View
      style={[
        styles.root,
        compact ? styles.compactRoot : styles.fullRoot,
        { backgroundColor: theme.card },
      ]}
    >
      {compact ? (
        profileSwitcher
      ) : (
        <View accessibilityLabel="활성 프로필" style={styles.profileHeader}>
          <View
            style={[
              styles.cover,
              { backgroundColor: theme.surface },
              Platform.OS === 'web' && webCover,
            ]}
          />
          <View style={styles.largeAvatar}>
            <Avatar
              label={profile?.displayName || profile?.handle || '?'}
              size={96}
              style={avatarShadow}
            />
          </View>
          {profile ? (
            <Pressable
              accessibilityLabel="프로필 편집"
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              disabled
              style={[styles.editButton, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.editLabel}>편집</Text>
            </Pressable>
          ) : null}
          <View style={styles.profileCopy}>
            {profileSwitcher}
            {profile ? (
              <>
                <Text
                  accessibilityLabel="활성 프로필 핸들"
                  numberOfLines={1}
                  style={[styles.profileHandle, { color: theme.textSecondary }]}
                >
                  {profile.relativeHandle}
                </Text>
                <View style={styles.counts}>
                  <Link asChild href={`/@${profile.handle}/following`}>
                    <Pressable accessibilityRole="link" style={styles.countLink}>
                      <Text style={[styles.count, { color: theme.text }]}>
                        {countFormatter.format(profile.followingCount).toLowerCase()}
                      </Text>
                      <Text style={[styles.countLabel, { color: theme.text }]}>팔로잉</Text>
                    </Pressable>
                  </Link>
                  <Link asChild href={`/@${profile.handle}/followers`}>
                    <Pressable accessibilityRole="link" style={styles.countLink}>
                      <Text style={[styles.count, { color: theme.text }]}>
                        {countFormatter.format(profile.followersCount).toLowerCase()}
                      </Text>
                      <Text style={[styles.countLabel, { color: theme.text }]}>팔로워</Text>
                    </Pressable>
                  </Link>
                </View>
              </>
            ) : (
              <Text style={[styles.emptyProfile, { color: theme.textSecondary }]}>
                {hasProfiles ? '사용할 프로필을 선택해주세요.' : '새 프로필을 만들어 시작하세요.'}
              </Text>
            )}
          </View>
        </View>
      )}

      <View
        style={[
          styles.navigationArea,
          compact && styles.compactNavigationArea,
          { borderColor: theme.border },
        ]}
      >
        <View accessibilityLabel="주요 메뉴" role="navigation" style={styles.navigation}>
          {navigation.map((item) => {
            const { active, href } = resolveItem(item);
            const control = (
              <Pressable
                aria-current={active ? 'page' : undefined}
                accessibilityLabel={item.label}
                accessibilityRole={href ? 'link' : 'button'}
                accessibilityState={{ disabled: !href }}
                disabled={!href}
                onPress={onNavigate}
                style={({ pressed }) => [
                  styles.item,
                  compact && styles.compactItem,
                  {
                    backgroundColor: active ? theme.surface : 'transparent',
                    opacity: !href ? 0.5 : pressed ? 0.65 : 1,
                  },
                ]}
              >
                <item.Icon color={theme.text} size={20} strokeWidth={2} />
                {!compact ? (
                  <Text style={[styles.itemLabel, { color: theme.text }]}>{item.label}</Text>
                ) : null}
              </Pressable>
            );

            return href ? (
              <Link asChild href={href} key={item.label}>
                {control}
              </Link>
            ) : (
              <View key={item.label}>{control}</View>
            );
          })}
          {compact || surface === 'drawer' ? (
            <Link asChild href="/compose">
              <Pressable
                accessibilityLabel="글쓰기"
                accessibilityRole="link"
                onPress={onNavigate}
                style={({ pressed }) => [
                  styles.compose,
                  compact && styles.compactCompose,
                  { backgroundColor: theme.primary, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Pencil color="#111111" size={20} strokeWidth={2} />
                {!compact ? <Text style={styles.composeLabel}>글쓰기</Text> : null}
              </Pressable>
            </Link>
          ) : null}
          {!compact ? (
            <Pressable accessibilityLabel="로그아웃" accessibilityRole="button" style={styles.item}>
              <LogOut color="#404040" size={20} strokeWidth={1.5} />
              <Text style={[styles.itemLabel, { color: theme.text }]}>로그아웃</Text>
            </Pressable>
          ) : null}
        </View>

        <View
          style={[styles.footer, compact && styles.compactFooter, { borderColor: theme.border }]}
        >
          {compact ? (
            <Pressable
              accessibilityLabel="로그아웃"
              accessibilityRole="button"
              style={[styles.footerItem, styles.compactItem]}
            >
              <LogOut color={theme.textSecondary} size={20} strokeWidth={1.5} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="설정 & 지원"
            accessibilityRole="button"
            style={[styles.footerItem, compact && styles.compactItem]}
          >
            <Settings color={theme.textSecondary} size={20} strokeWidth={1.5} />
            {!compact ? (
              <>
                <Text style={[styles.footerLabel, styles.footerLabelGrow, { color: theme.text }]}>
                  설정 &amp; 지원
                </Text>
                <ChevronDown color={theme.textSecondary} size={16} />
              </>
            ) : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  compactRoot: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.lg,
    width: 80,
  },
  fullRoot: { width: 320 },
  profileHeader: { height: 260, position: 'relative', width: 320, zIndex: 20 },
  cover: { height: 104, left: 0, position: 'absolute', right: 0, top: 0 },
  largeAvatar: { left: 20, position: 'absolute', top: 54 },
  editButton: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 32,
    justifyContent: 'center',
    opacity: 0.6,
    paddingHorizontal: spacing.md,
    position: 'absolute',
    right: 20,
    top: 134,
  },
  editLabel: { color: '#111111', fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  profileCopy: { left: 20, position: 'absolute', right: 20, top: 148 },
  profileHandle: { fontFamily: 'SUIT', ...typography.sm },
  emptyProfile: { fontFamily: 'SUIT', marginTop: spacing.sm, ...typography.sm },
  counts: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  countLink: { flexDirection: 'row', gap: spacing.sm },
  count: { fontFamily: 'SUIT', ...typography.sm },
  countLabel: { fontFamily: 'SUIT', ...typography.sm },
  navigationArea: {
    borderTopWidth: 1,
    flex: 1,
    padding: spacing.lg,
    position: 'relative',
    zIndex: 0,
  },
  compactNavigationArea: { alignItems: 'center', borderTopWidth: 0, padding: 0, width: '100%' },
  navigation: { gap: spacing.xs, width: '100%' },
  item: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 45,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  compactItem: { justifyContent: 'center', paddingHorizontal: 0, width: 44 },
  itemLabel: { fontFamily: 'SUIT', ...typography.md },
  compose: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: 45,
    paddingHorizontal: spacing.lg,
  },
  compactCompose: { borderRadius: radii.full, height: 44, paddingHorizontal: 0, width: 44 },
  composeLabel: { color: '#111111', fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  footer: { borderTopWidth: 1, marginTop: 'auto', paddingTop: spacing.xs, width: '100%' },
  compactFooter: { borderTopWidth: 0 },
  footerItem: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 45,
    paddingHorizontal: spacing.lg,
  },
  footerLabel: { fontFamily: 'SUIT', ...typography.sm },
  footerLabelGrow: { flex: 1 },
});
