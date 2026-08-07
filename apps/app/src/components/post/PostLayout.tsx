import { Link } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
import { PostMediaViewer } from './PostMediaViewer';
import { createPostMediaViewerSession } from './postMediaViewerSession';
import { usePostReplyBinding } from './PostReplyCoordinator';
import { PostSourcePreview } from './PostSourcePresentationView';
import { ReplyComposerSurface } from './ReplyComposerSurface';
import { getReplyProcessingState } from './replySurface';
import type { ReactNode } from 'react';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { PostActionBarProps } from './PostActionBar';
import type { PostContentWarningPresentation } from './PostContentRenderer';
import type { PostMediaOpenHandler } from './PostMediaImage';
import type { PostMediaViewerSession } from './postMediaViewerSession';
import type { SourcePostPresentationData } from './PostSourcePresentationView';

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
    ...PostMediaViewer_post
    repostSource {
      id
      createdAt
      content {
        bodyText
        contentWarning
        document
        media {
          id
          altText
          url
        }
      }
      profile {
        avatar {
          id
          url
        }
        displayName
        handle
        relativeHandle
      }
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
  viewerWideDetail,
}: {
  contentWarningPresentation?: PostContentWarningPresentation;
  mediaPresentation?: 'default' | 'hidden';
  onDeleted?: () => void;
  post: PostLayout_post$key;
  viewerWideDetail?: ReactNode;
}) {
  const theme = useTheme();
  const post = useFragment(PostLayoutFragment, postKey);
  const [viewerSession, setViewerSession] = useState<PostMediaViewerSession | null>(null);
  const replyBinding = usePostReplyBinding(post.id);
  const replyAuthentication = usePostActionAuthentication(Boolean(post.content));
  const replyTriggerRef = useRef<View>(null);
  const surfaceRef = useRef<View>(null);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const source = post.repostSource;
  const pureRepost = !post.content && !post.replyParent && post.repostSource;
  const socialActionTarget = pureRepost ? post.repostSource?.actionSurface : post.actionSurface;
  const content = post.content;
  const closeViewer = useCallback(() => setViewerSession(null), []);
  const handleMediaOpen = useCallback<PostMediaOpenHandler>((selectedIndex, originControl) => {
    setViewerSession(createPostMediaViewerSession(selectedIndex, originControl));
  }, []);
  const handleDeleted = useCallback(() => {
    closeViewer();
    onDeleted?.();
  }, [closeViewer, onDeleted]);
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
  const viewerReply = reply
    ? {
        ...reply,
        controlRef: undefined,
        onPress: () => {
          closeViewer();
          requestAnimationFrame(() => reply.onPress());
        },
      }
    : undefined;
  const presentationSource: SourcePostPresentationData | null = source
    ? {
        content: source.content
          ? {
              bodyText: source.content.bodyText,
              contentWarning: source.content.contentWarning,
              document: source.content.document,
              media:
                source.content.media?.map(({ altText, id, url }) => ({
                  altText: altText ?? null,
                  id,
                  url: url ?? null,
                })) ?? null,
              postId: source.id,
            }
          : null,
        createdAt: source.createdAt,
        id: source.id,
        profile: {
          displayName: source.profile.displayName,
          handle: source.profile.handle,
          relativeHandle: source.profile.relativeHandle,
          avatar: source.profile.avatar,
        },
      }
    : null;

  return (
    <View ref={surfaceRef} style={styles.root} tabIndex={-1}>
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
            size={40}
          />
        </Pressable>
      </Link>
      <View style={styles.content}>
        <ProfileNameBlock href={profileHref} profile={post.profile} />
        <View style={styles.body}>
          <PostBody
            contentWarningPresentation={contentWarningPresentation}
            mediaPresentation={mediaPresentation}
            onMediaOpen={mediaPresentation === 'hidden' ? undefined : handleMediaOpen}
            post={post}
            size="lg"
          />
          {presentationSource ? (
            <PostSourcePreview source={presentationSource} style={styles.source} />
          ) : null}
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {formatPostDate(post.createdAt)} ·{' '}
            {visibilityLabels[post.visibility] ?? post.visibility}
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
      {mediaPresentation === 'default' && viewerSession ? (
        <PostMediaViewer
          actionBar={
            content && socialActionTarget ? (
              <PostActionSurface
                onDeleted={handleDeleted}
                reactionSummaryStyle={styles.viewerReactionSummary}
                reply={viewerReply}
                socialActionTarget={socialActionTarget}
              />
            ) : null
          }
          fallbackFocus={surfaceRef}
          onClose={closeViewer}
          originControl={viewerSession.originControl}
          post={post}
          selectedIndex={viewerSession.selectedIndex}
          wideDetail={content ? viewerWideDetail : null}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  avatar: { borderRadius: radii.full },
  content: { flex: 1, gap: spacing.xs, minWidth: 0 },
  body: { minWidth: 0 },
  meta: { fontFamily: 'SUIT', marginTop: 6, textAlign: 'right', ...typography.xsm },
  reactionSummary: { marginBottom: spacing.xs, marginTop: spacing.lg },
  source: { marginTop: spacing.sm },
  replySurface: { marginTop: spacing.lg },
  viewerReactionSummary: { display: 'none' },
});
