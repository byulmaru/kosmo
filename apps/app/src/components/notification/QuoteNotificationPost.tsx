import { useRouter } from 'expo-router';
import { Quote } from 'lucide-react-native';
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
import type { QuoteNotificationPost_post$key } from './__generated__/QuoteNotificationPost_post.graphql';

const QuoteNotificationPostFragment = graphql`
  fragment QuoteNotificationPost_post on Post {
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

/** Presentation-only Quote surface until the concrete QuoteNotification API is available. */
export function QuoteNotificationPost({
  onActivate,
  post: postKey,
}: {
  onActivate?: () => void;
  post: QuoteNotificationPost_post$key;
}) {
  const post = useFragment(QuoteNotificationPostFragment, postKey);
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
      <View role="article" style={styles.root} testID="quote-notification-post">
        <Text style={styles.srOnly}>인용 알림</Text>
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.kind}
          testID="quote-notification-kind"
        >
          <Quote color={theme.foregroundSecondary} size={32} />
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
          <Text
            style={[styles.reason, { color: theme.foregroundSecondary }]}
            testID="notification-reason"
          >
            회원님의 게시글을 인용했습니다
          </Text>
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
  detailReplySurface: { marginLeft: spacing.xxl * 2, marginRight: spacing.sm },
});
