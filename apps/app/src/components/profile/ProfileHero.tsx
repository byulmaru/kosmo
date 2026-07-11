import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { ProfileHero_profile$key } from './__generated__/ProfileHero_profile.graphql';

type ProfileHeroProps = {
  action?: ReactNode;
  loading?: boolean;
  profile?: ProfileHero_profile$key | null;
};

const profileHeroFragment = graphql`
  fragment ProfileHero_profile on Profile {
    handle
    relativeHandle
    displayName
    bio
    followersCount
    followingCount
  }
`;

const countFormatter = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  notation: 'compact',
});

export function ProfileHero({ action, loading = false, profile = null }: ProfileHeroProps) {
  const theme = useTheme();
  const data = useFragment(profileHeroFragment, profile);

  if (loading) {
    return (
      <View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.cover, { backgroundColor: theme.surface }]} />
          <View style={styles.body}>
            <View
              style={[
                styles.avatarSkeleton,
                { backgroundColor: theme.surface, borderColor: theme.background },
              ]}
            />
            <View style={styles.skeletonCopy}>
              <Skeleton height={20} width="50%" />
              <Skeleton height={16} width="30%" />
              <Skeleton height={16} width="70%" />
            </View>
          </View>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
          프로필을 불러오는 중입니다.
        </Text>
      </View>
    );
  }

  if (!data) {
    return null;
  }

  const followingHref = `/@${data.handle}/following` as Href;
  const followersHref = `/@${data.handle}/followers` as Href;

  return (
    <View style={styles.root}>
      <View style={[styles.cover, { backgroundColor: theme.primary }]} />
      <View style={styles.body}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatarBorder, { backgroundColor: theme.background }]}>
            <Avatar label={data.displayName || data.handle} size={72} />
          </View>
          {action ? <View style={styles.action}>{action}</View> : null}
        </View>
        <Text accessibilityRole="header" style={[styles.displayName, { color: theme.text }]}>
          {data.displayName}
        </Text>
        <Text style={[styles.handle, { color: theme.textSecondary }]}>{data.relativeHandle}</Text>
        {data.bio ? <Text style={[styles.bio, { color: theme.text }]}>{data.bio}</Text> : null}
        <View style={styles.counts}>
          <Link asChild href={followingHref}>
            <Pressable accessibilityRole="link" style={styles.countLink}>
              <Text style={[styles.count, { color: theme.text }]}>
                {countFormatter.format(data.followingCount).toLowerCase()}
              </Text>
              <Text style={[styles.countLabel, { color: theme.textSecondary }]}>팔로잉</Text>
            </Pressable>
          </Link>
          <Link asChild href={followersHref}>
            <Pressable accessibilityRole="link" style={styles.countLink}>
              <Text style={[styles.count, { color: theme.text }]}>
                {countFormatter.format(data.followersCount).toLowerCase()}
              </Text>
              <Text style={[styles.countLabel, { color: theme.textSecondary }]}>팔로워</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: spacing.xl },
  cover: { height: 104, width: '100%' },
  body: { paddingHorizontal: spacing.lg },
  avatarRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  avatarBorder: { borderRadius: radii.full, marginTop: -40, padding: spacing.xs },
  avatarSkeleton: {
    borderRadius: radii.full,
    borderWidth: spacing.xs,
    height: 80,
    marginTop: -40,
    width: 80,
  },
  action: { marginTop: spacing.md },
  displayName: { fontFamily: 'SUIT', fontWeight: '700', marginTop: spacing.md, ...typography.xl },
  handle: { fontFamily: 'SUIT', ...typography.sm },
  bio: { fontFamily: 'SUIT', marginTop: spacing.md, ...typography.md },
  counts: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  countLink: { flexDirection: 'row', gap: spacing.xs },
  count: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  countLabel: { fontFamily: 'SUIT', ...typography.sm },
  skeletonCopy: { gap: spacing.sm, marginTop: spacing.lg },
  srOnly: {
    height: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
