import { useRouter } from 'expo-router';
import { MessageCircle, Quote } from 'lucide-react-native';
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
import { radii, spacing, textStyles } from '@/theme/tokens';
import type { PostMediaOpenHandler } from '@/components/post/PostMediaImage';
import type { PostNotificationPost_post$key } from './__generated__/PostNotificationPost_post.graphql';

const PostNotificationPostFragment = graphql`
  fragment PostNotificationPost_post on Post {
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

type PostNotificationKind = 'quote' | 'reply';

const presentations = {
  quote: {
    Icon: Quote,
    label: '인용 알림',
    reason: '회원님의 게시글을 인용했습니다',
  },
  reply: { Icon: MessageCircle, label: '답글 알림', reason: null },
} as const;

/** Shared Post composition for recipient-relative Reply and Quote notifications. */
export function PostNotificationPost({
  kind,
  onActivate,
  post: postKey,
}: {
  kind: PostNotificationKind;
  onActivate?: () => void;
  post: PostNotificationPost_post$key;
}) {
  const post = useFragment(PostNotificationPostFragment, postKey);
  const theme = useTheme();
  const router = useRouter();
  const openViewer = usePostMediaViewerHost();
  const { reply, replySurface } = usePostReplySurface(post);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const detailHref = `/${post.profile.relativeHandle}/${post.id}` as const;
  const { Icon, label, reason } = presentations[kind];
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
      <View role="article" style={styles.root} testID={`${kind}-notification-post`}>
        <Text style={styles.srOnly}>{label}</Text>
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.kind}
          testID={`${kind}-notification-kind`}
        >
          <Icon color={theme.foregroundSecondary} size={32} />
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
          {reason ? (
            <Text
              style={[styles.reason, { color: theme.foregroundSecondary }]}
              testID="notification-reason"
            >
              {reason}
            </Text>
          ) : null}
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
      {replySurface}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
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
  time: { textAlign: 'right' },
  reason: { ...textStyles.uiCopyM },
  bodyLink: { borderRadius: radii.sm, minWidth: 0 },
  actionBar: { paddingTop: spacing.xs },
  reactionSummary: { marginTop: spacing.xs },
});
