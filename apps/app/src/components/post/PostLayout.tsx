import { Link } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { formatPostDate } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { PostActionSurface } from './PostActionSurface';
import { PostBody } from './PostBody';
import { usePostMediaViewerHost } from './PostMediaViewerHost';
import { usePostReplyBinding } from './PostReplyCoordinator';
import { PostSourcePreview } from './PostSourcePresentationView';
import { ReplyComposerSurface } from './ReplyComposerSurface';
import { getReplyProcessingState } from './replySurface';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { PostActionBarProps } from './PostActionBar';
import type { PostContentWarningPresentation } from './PostContentRenderer';
import type { PostMediaOpenHandler } from './PostMediaImage';

const PostLayoutFragment = graphql`
  fragment PostLayout_post on Post {
    id
    createdAt
    visibility
    content {
      id
      bodyText
      media {
        id
        altText
        url
      }
      contentWarning
    }
    profile {
      avatar {
        id
        url
      }
      id
      handle
      relativeHandle
      displayName
      ...ProfileNameBlock_profile
    }
    replyParent {
      id
    }
    ...ReplyComposerSurface_parent @alias(as: "replySurface")
    ...PostActionSurface_post @alias(as: "actionSurface")
    repostSource {
      ...PostSourcePreview_source
      ...PostActionSurface_post @alias(as: "actionSurface")
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

export function PostLayout({
  contentWarningPresentation = 'default',
  mediaPresentation = 'default',
  onDeleted,
  post: postKey,
  replyAvailable,
  replySurfacePostId,
}: {
  contentWarningPresentation?: PostContentWarningPresentation;
  mediaPresentation?: 'default' | 'hidden';
  onDeleted?: () => void;
  post: PostLayout_post$key;
  replyAvailable?: boolean;
  replySurfacePostId?: string;
}) {
  const theme = useTheme();
  const post = useFragment(PostLayoutFragment, postKey);
  const openViewer = usePostMediaViewerHost();
  const replyBinding = usePostReplyBinding(replySurfacePostId ?? post.id);
  const replyAuthentication = usePostActionAuthentication(replyAvailable ?? Boolean(post.content));
  const replyTriggerRef = useRef<View>(null);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const source = post.repostSource;
  const pureRepost = !post.content && !post.replyParent && post.repostSource;
  const socialActionTarget = pureRepost ? post.repostSource?.actionSurface : post.actionSurface;
  const handleDeleted = useCallback(() => onDeleted?.(), [onDeleted]);
  const handleMediaOpen = useCallback<PostMediaOpenHandler>(
    (selectedIndex, originControl) => {
      openViewer({
        mediaOwnerPostId: post.id,
        onDeleted: handleDeleted,
        originControl,
        selectedIndex,
        surfacePostId: post.id,
      });
    },
    [handleDeleted, openViewer, post.id],
  );
  const reply: PostActionBarProps['reply'] = replyBinding
    ? {
        accessibilityLabel: '답글',
        controlRef: replyTriggerRef,
        expanded: replyAuthentication.execution.kind === 'enabled' && replyBinding.expanded,
        onPress: () => {
          if (replyAuthentication.execution.kind === 'resolution-required') {
            replyAuthentication.resolve(replyAuthentication.execution.reason);
          } else if (replyAuthentication.execution.kind === 'enabled') {
            replyBinding.onPress();
          }
        },
        processing: getReplyProcessingState(
          replyAuthentication.execution,
          Boolean(replyBinding.profile),
        ),
      }
    : undefined;
  return (
    <View style={styles.root}>
      <View style={styles.header}>
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
        <View style={styles.headerContent}>
          <ProfileNameBlock href={profileHref} profile={post.profile} />
        </View>
      </View>
      <View style={styles.body}>
        <PostBody
          contentWarningPresentation={contentWarningPresentation}
          mediaPresentation={mediaPresentation}
          onMediaOpen={mediaPresentation === 'hidden' ? undefined : handleMediaOpen}
          post={post}
          size="lg"
        />
        {source ? <PostSourcePreview source={source} style={styles.source} /> : null}
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {formatPostDate(post.createdAt)} · {visibilityLabels[post.visibility] ?? post.visibility}
        </Text>
        <PostActionSurface
          onDeleted={handleDeleted}
          reactionSummaryStyle={styles.reactionSummary}
          reply={reply}
          socialActionTarget={socialActionTarget!}
        />
        {replyBinding?.expanded &&
        replyAuthentication.execution.kind === 'enabled' &&
        replyBinding?.profile &&
        post.content &&
        post.replySurface ? (
          <View style={styles.replySurface}>
            <ReplyComposerSurface
              ref={replyBinding.surfaceRef}
              onPostCreated={replyBinding.onPostCreated}
              onRequestClose={replyBinding.onRequestClose}
              open={replyBinding.expanded}
              owner={replyBinding.owner}
              parent={post.replySurface}
              profile={replyBinding.profile}
              triggerRef={replyTriggerRef}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, minWidth: 0 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  avatar: { borderRadius: radii.full },
  headerContent: { flex: 1, minWidth: 0 },
  body: { minWidth: 0 },
  meta: { fontFamily: 'SUIT', marginTop: 6, textAlign: 'right', ...typography.xsm },
  reactionSummary: { marginBottom: spacing.xs, marginTop: spacing.lg },
  source: { marginTop: spacing.sm },
  replySurface: { marginTop: spacing.lg },
});
