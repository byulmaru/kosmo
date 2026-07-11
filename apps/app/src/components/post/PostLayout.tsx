import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { formatPostDate } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostBody } from './PostBody';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';

const PostLayoutFragment = graphql`
  fragment PostLayout_post on Post {
    id
    createdAt
    visibility
    profile {
      id
      handle
      displayName
      ...ProfileNameBlock_profile
    }
    ...PostBody_post
  }
`;

const visibilityLabels: Record<string, string> = {
  PUBLIC: '전체 공개',
  UNLISTED: '조용히 공개',
  FOLLOWERS: '팔로워 공개',
  DIRECT: '다이렉트',
};

export function PostLayout({ post: postKey }: { post: PostLayout_post$key }) {
  const theme = useTheme();
  const post = useFragment(PostLayoutFragment, postKey);
  const profileHref = `/@${post.profile.handle}` as const;

  return (
    <View style={styles.root}>
      <Link asChild href={profileHref}>
        <Pressable
          aria-hidden
          accessibilityElementsHidden
          accessible={false}
          focusable={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.avatar}
          tabIndex={-1}
        >
          <Avatar label={post.profile.displayName || post.profile.handle} size={40} />
        </Pressable>
      </Link>
      <View style={styles.content}>
        <ProfileNameBlock href={profileHref} profile={post.profile} />
        <View style={styles.body}>
          <PostBody post={post} size="lg" />
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {formatPostDate(post.createdAt)} ·{' '}
            {visibilityLabels[post.visibility] ?? post.visibility}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  avatar: { borderRadius: radii.full },
  content: { flex: 1, gap: spacing.xs, minWidth: 0 },
  body: { minWidth: 0 },
  meta: { fontFamily: 'SUIT', marginTop: 6, textAlign: 'right', ...typography.xsm },
});
