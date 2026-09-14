import { useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { PostActionSurface } from '@/components/post/PostActionSurface';
import { PostBody } from '@/components/post/PostBody';
import { usePostMediaViewerHost } from '@/components/post/PostMediaViewerHost';
import { usePostReplySurface } from '@/components/post/PostReplySurface';
import { PostSourcePreview } from '@/components/post/PostSourcePresentationView';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Avatar } from '@/components/ui/Avatar';
import { TimestampText } from '@/components/ui/TimestampText';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';
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
      ...ProfileNameBlock_profile
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
export function ReplyNotificationPost({
  onActivate,
  post: postKey,
}: {
  onActivate?: () => void;
  post: ReplyNotificationPost_post$key;
}) {
  const post = useFragment(ReplyNotificationPostFragment, postKey);
  const theme = useTheme();
  const router = useRouter();
  const openViewer = usePostMediaViewerHost();
  const { reply, replySurface, owner: replyOwner } = usePostReplySurface(post);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const detailHref = `/${post.profile.relativeHandle}/${post.id}` as const;
  const onMediaOpen = useCallback<PostMediaOpenHandler>(
    (selectedIndex, originControl) => {
      onActivate?.();
      openViewer({
        mediaOwnerPostId: post.id,
        originControl,
        selectedIndex,
        surfacePostId: post.id,
      });
    },
    [onActivate, openViewer, post.id],
  );

  if (!post.content) {
    return null;
  }

  return (
    <>
      <View role="article" style={styles.root} testID="reply-notification-post">
        <Text style={styles.srOnly}>답글 알림</Text>
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.kind}
          testID="reply-notification-kind"
        >
          <MessageCircle color={theme.foregroundSecondary} size={32} />
        </View>
        <View style={styles.content}>
          <View style={styles.header}>
            <NavigationLink href={profileHref}>
              <Pressable
                accessibilityRole="link"
                onPress={onActivate}
                style={styles.author}
                testID="notification-post-author"
              >
                <View
                  aria-hidden
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.authorAvatar}
                  testID="notification-post-avatar"
                >
                  <Avatar
                    imageUri={post.profile.avatar?.url}
                    label={post.profile.displayName || post.profile.handle}
                    size={24}
                  />
                </View>
                <ProfileNameBlock profile={post.profile} variant="inline" />
              </Pressable>
            </NavigationLink>
            <NavigationLink href={detailHref}>
              <Pressable accessibilityRole="link" onPress={onActivate} style={styles.timeLink}>
                <TimestampText style={styles.time}>
                  {formatTimelineTimestamp(post.createdAt)}
                </TimestampText>
              </Pressable>
            </NavigationLink>
          </View>
          <View style={styles.bodyLink}>
            <PostBody
              onBodyPress={() => {
                onActivate?.();
                router.push(detailHref);
              }}
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minWidth: 0,
  },
  kind: { alignItems: 'center', flexShrink: 0, height: 48, justifyContent: 'center', width: 48 },
  srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', left: 0, top: 0 },
  content: { flex: 1, gap: spacing.xs, minWidth: 0 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  author: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: Platform.OS === 'web' ? 24 : Platform.OS === 'android' ? 48 : 44,
    overflow: 'hidden',
  },
  authorAvatar: { flexShrink: 0, height: 24, width: 24 },
  timeLink: {
    alignItems: 'flex-end',
    borderRadius: radii.sm,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: Platform.OS === 'web' ? 24 : Platform.OS === 'android' ? 48 : 44,
    minWidth: Platform.OS === 'web' ? 24 : Platform.OS === 'android' ? 48 : 44,
  },
  time: {
    textAlign: 'right',
  },
  bodyLink: { borderRadius: radii.sm, minWidth: 0 },
  actionBar: { paddingTop: spacing.xs },
  reactionSummary: { marginTop: spacing.xs },
  detailReplySurface: { marginLeft: spacing.xxl * 2, marginRight: spacing.sm },
});
