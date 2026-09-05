import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radius, space, textStyles } from '@/theme/tokens';
import { ProfileTagChip } from './ProfileTagChip';
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
    tags {
      id
      name
    }
    avatar {
      id
      url
    }
    header {
      id
      url
    }
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
  const { width } = useWindowDimensions();
  const data = useFragment(profileHeroFragment, profile);
  const compact = Platform.OS !== 'web' || width < breakpoints.compact;
  const avatarSize = compact ? 88 : 120;
  const avatarFrameSize = compact ? 96 : 128;
  const avatarOverlap = avatarFrameSize / 2;
  const avatarRowHeight = compact ? 64 : 80;
  const actionMarginTop = compact ? space[12] : space[16] + space[4];

  if (loading) {
    return (
      <View style={styles.root}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.cover, { backgroundColor: theme.backgroundSurface }]} />
          <View
            style={[styles.avatarRow, { height: avatarRowHeight, paddingHorizontal: space[16] }]}
          >
            <Skeleton
              circular
              height={avatarFrameSize}
              style={[
                styles.avatarSkeleton,
                { borderColor: theme.backgroundCanvas, marginTop: -avatarOverlap },
              ]}
              width={avatarFrameSize}
            />
            {action ? (
              <View style={[styles.action, { marginTop: actionMarginTop }]}>{action}</View>
            ) : null}
          </View>
          <View style={styles.skeletonCopy}>
            <Skeleton height={20} width="50%" />
            <Skeleton height={16} width="30%" />
            <Skeleton height={16} width="70%" />
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

  const followingHref = `/${data.relativeHandle}/following` as Href;
  const followersHref = `/${data.relativeHandle}/followers` as Href;

  return (
    <View style={styles.root}>
      <View style={[styles.cover, { backgroundColor: theme.actionPrimaryBase }]}>
        {data.header?.url ? (
          <Image
            accessible={false}
            resizeMode="cover"
            source={{ uri: data.header.url }}
            style={styles.coverImage}
          />
        ) : null}
      </View>
      <View style={[styles.avatarRow, { height: avatarRowHeight, paddingHorizontal: space[16] }]}>
        <View
          style={[
            styles.avatarBorder,
            { backgroundColor: theme.backgroundCanvas, marginTop: -avatarOverlap },
          ]}
        >
          <Avatar
            imageUri={data.avatar?.url}
            label={data.displayName || data.handle}
            size={avatarSize}
          />
        </View>
        {action ? (
          <View style={[styles.action, { marginTop: actionMarginTop }]}>{action}</View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text
          accessibilityRole="header"
          style={[styles.displayName, { color: theme.foregroundPrimary }]}
        >
          {data.displayName}
        </Text>
        <Text style={[styles.handle, { color: theme.foregroundSecondary }]}>
          {data.relativeHandle}
        </Text>
        {data.bio ? (
          <Text style={[styles.bio, { color: theme.foregroundPrimary }]}>{data.bio}</Text>
        ) : null}
        {data.tags.length ? (
          <View style={styles.tags} testID="profile-tag-list">
            {data.tags.map((tag) => (
              <ProfileTagLink id={tag.id} key={tag.id} name={tag.name} />
            ))}
          </View>
        ) : null}
        <View style={styles.counts}>
          <NavigationLink href={followingHref}>
            <Pressable accessibilityRole="link" style={styles.countLink}>
              <Text style={[styles.count, { color: theme.foregroundPrimary }]}>
                {countFormatter.format(data.followingCount).toLowerCase()}
              </Text>
              <Text style={[styles.countLabel, { color: theme.foregroundSecondary }]}>팔로잉</Text>
            </Pressable>
          </NavigationLink>
          <NavigationLink href={followersHref}>
            <Pressable accessibilityRole="link" style={styles.countLink}>
              <Text style={[styles.count, { color: theme.foregroundPrimary }]}>
                {countFormatter.format(data.followersCount).toLowerCase()}
              </Text>
              <Text style={[styles.countLabel, { color: theme.foregroundSecondary }]}>팔로워</Text>
            </Pressable>
          </NavigationLink>
        </View>
      </View>
    </View>
  );
}

function ProfileTagLink({ id, name }: { id: string; name: string }) {
  const targetSize = Platform.select({ android: 48, default: 48, ios: 44, web: 32 });
  const href = {
    params: { hashtagId: id },
    pathname: '/hashtags/[hashtagId]/profiles',
  } as const;

  return (
    <NavigationLink href={href}>
      <Pressable
        accessibilityLabel={`#${name} 관련 프로필 보기`}
        accessibilityRole="link"
        style={StyleSheet.flatten([
          styles.tagTarget,
          { minHeight: targetSize, minWidth: targetSize },
        ])}
      >
        <ProfileTagChip name={name} removable={false} />
      </Pressable>
    </NavigationLink>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: space[24] },
  cover: { aspectRatio: 3, width: '100%' },
  coverImage: { height: '100%', width: '100%' },
  body: { paddingBottom: space[4], paddingHorizontal: space[16] },
  avatarRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  avatarBorder: { borderRadius: radius.full, overflow: 'hidden', padding: space[4] },
  avatarSkeleton: {
    borderWidth: space[4],
  },
  action: { alignItems: 'flex-end', height: 40, width: 96 },
  displayName: textStyles.uiHeadingM,
  handle: textStyles.uiCopyM,
  bio: { marginTop: space[12], ...textStyles.uiCopyL },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8], marginTop: space[12] },
  tagTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  counts: { flexDirection: 'row', gap: space[16], marginTop: space[12] },
  countLink: { flexDirection: 'row', gap: space[4] },
  count: textStyles.uiLabelM,
  countLabel: textStyles.uiCopyM,
  skeletonCopy: { gap: space[8], paddingHorizontal: space[16], paddingTop: space[8] },
  srOnly: {
    height: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
