import { Link, useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { PostActionSurface } from '@/components/post/PostActionSurface';
import { PostBody } from '@/components/post/PostBody';
import { usePostMediaViewerHost } from '@/components/post/PostMediaViewerHost';
import { usePostReplySurface } from '@/components/post/PostReplySurface';
import { PostSourcePreview } from '@/components/post/PostSourcePresentationView';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { PostMediaOpenHandler } from '@/components/post/PostMediaImage';
import type { ReplyNotificationPost_post$key } from './__generated__/ReplyNotificationPost_post.graphql';

const ReplyNotificationPostFragment = graphql`
  fragment ReplyNotificationPost_post on Post {
    id
    createdAt
    content {
      id
    }
    profile {
      avatar {
        url
      }
      handle
      relativeHandle
      displayName
    }
    ...PostBody_post
    ...PostActionSurface_post @alias(as: "actionSurface")
    ...PostReplySurface_post
    repostSource {
      ...PostSourcePreview_source
    }
  }
`;

/** Recipient-relative Reply presentation, composed inside NotificationListItemView. */
export function ReplyNotificationPost({ post: postKey }: { post: ReplyNotificationPost_post$key }) {
  const post = useFragment(ReplyNotificationPostFragment, postKey);
  const theme = useTheme();
  const router = useRouter();
  const openViewer = usePostMediaViewerHost();
  const { reply, replySurface, owner: replyOwner } = usePostReplySurface(post);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const detailHref = `/${post.profile.relativeHandle}/${post.id}` as const;
  const onMediaOpen = useCallback<PostMediaOpenHandler>(
    (selectedIndex, originControl) => {
      openViewer({
        mediaOwnerPostId: post.id,
        originControl,
        selectedIndex,
        surfacePostId: post.id,
      });
    },
    [openViewer, post.id],
  );

  if (!post.content) {
    return null;
  }

  return (
    <>
      <View role="article" style={styles.root} testID="reply-notification-post">
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
            <Avatar
              imageUri={post.profile.avatar?.url}
              label={post.profile.displayName || post.profile.handle}
              size={48}
            />
          </Pressable>
        </Link>
        <View style={styles.content}>
          <View style={styles.header}>
            <NavigationLink href={profileHref}>
              <Pressable
                accessibilityRole="link"
                style={styles.author}
                testID="notification-post-author"
              >
                <Text numberOfLines={1} style={[styles.name, { color: theme.foregroundPrimary }]}>
                  {post.profile.displayName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.handle, { color: theme.foregroundSecondary }]}
                >
                  {post.profile.relativeHandle}
                </Text>
              </Pressable>
            </NavigationLink>
            <Link asChild href={detailHref}>
              <Pressable accessibilityRole="link" style={styles.timeLink}>
                <Text style={[styles.time, { color: theme.foregroundSecondary }]}>
                  {formatTimelineTimestamp(post.createdAt)}
                </Text>
              </Pressable>
            </Link>
          </View>
          <View style={styles.reasonRow}>
            <View
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.reasonIcon}
            >
              <MessageCircle color={theme.foregroundSecondary} size={16} />
            </View>
            <Text
              testID="notification-reason"
              style={[styles.reason, { color: theme.foregroundSecondary }]}
            >
              회원님의 게시글에 답글을 남겼습니다
            </Text>
          </View>
          <View style={styles.bodyLink}>
            <PostBody
              onBodyPress={() => router.push(detailHref)}
              onMediaOpen={onMediaOpen}
              post={post}
            />
          </View>
          {post.repostSource ? <PostSourcePreview source={post.repostSource} /> : null}
          <PostActionSurface
            actionBarStyle={styles.actionBar}
            reactionSummaryStyle={styles.reactionSummary}
            reply={reply}
            socialActionTarget={post.actionSurface!}
          />
        </View>
      </View>
      {replySurface && replyOwner === 'detail' ? (
        <View style={styles.detailReplySurface}>{replySurface}</View>
      ) : (
        replySurface
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minWidth: 0,
  },
  avatar: { borderRadius: radii.full },
  content: { flex: 1, gap: spacing.xs, minWidth: 0 },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  author: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    minHeight: Platform.OS === 'web' ? 24 : Platform.OS === 'android' ? 48 : 44,
    overflow: 'hidden',
  },
  name: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md, flexShrink: 1 },
  handle: { fontFamily: 'SUIT', ...typography.sm, flex: 1, minWidth: 0 },
  timeLink: { borderRadius: radii.sm, flexShrink: 0 },
  time: {
    fontFamily: 'SUIT',
    ...typography.sm,
    minHeight: Platform.OS === 'web' ? 24 : Platform.OS === 'android' ? 48 : 44,
    minWidth: Platform.OS === 'web' ? 24 : Platform.OS === 'android' ? 48 : 44,
  },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  reasonIcon: { height: 20, justifyContent: 'center' },
  reason: { fontFamily: 'SUIT', ...typography.sm, flex: 1, minWidth: 0 },
  bodyLink: { borderRadius: radii.sm, minWidth: 0 },
  actionBar: { paddingTop: spacing.xs },
  reactionSummary: { marginTop: spacing.xs },
  detailReplySurface: { marginLeft: spacing.xxl * 2, marginRight: spacing.sm },
});
