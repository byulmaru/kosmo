import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { PostBody } from './PostBody';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';

const PostListItemFragment = graphql`
  fragment PostListItem_post on Post {
    id
    createdAt
    content {
      bodyText
    }
    profile {
      id
      handle
      displayName
      ...ProfileNameBlock_profile
    }
    ...PostBody_post
  }
`;

export function PostListItem({ post: postKey }: { post: PostListItem_post$key }) {
  const theme = useTheme();
  const router = useRouter();
  const post = useFragment(PostListItemFragment, postKey);
  const profileHref = `/@${post.profile.handle}` as const;
  const detailHref = `/@${post.profile.handle}/${post.id}` as const;

  return (
    <View role="article" style={[styles.card, { borderColor: theme.border }]}>
      <Pressable
        accessibilityLabel={`${post.profile.displayName} 프로필`}
        onPress={() => router.push(profileHref)}
      >
        <Avatar label={post.profile.displayName} />
      </Pressable>
      <View style={styles.content}>
        <View style={styles.header}>
          <ProfileNameBlock href={profileHref} profile={post.profile} />
          <Pressable onPress={() => router.push(detailHref)}>
            <Text style={[styles.time, { color: theme.textSecondary }]}>
              {formatTimelineTimestamp(post.createdAt)}
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityLabel={
            post.content?.bodyText?.trim()
              ? undefined
              : `${post.profile.displayName}의 내용 없는 게시글 상세 보기`
          }
          accessibilityRole="link"
          onPress={() => router.push(detailHref)}
          style={styles.bodyLink}
        >
          <PostBody post={post} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.lg,
  },
  content: { flex: 1, gap: spacing.sm, minWidth: 0 },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  time: { fontFamily: 'SUIT', ...typography.sm },
  bodyLink: { minHeight: 24 },
});
