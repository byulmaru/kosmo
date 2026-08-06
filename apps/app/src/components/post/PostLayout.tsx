import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { formatPostDate } from '@/lib/date';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { PostActionSurface } from './PostActionSurface';
import { PostBody } from './PostBody';
import { PostMediaViewer } from './PostMediaViewer';
import {
  createPostMediaViewerSession,
  focusPostMediaViewerTarget,
  reconcilePostMediaViewerSession,
} from './postMediaViewerSession';
import { usePostReplyBinding } from './PostReplyCoordinator';
import { PostSourcePreview } from './PostSourcePresentationView';
import { ReplyComposerSurface } from './ReplyComposerSurface';
import { getReplyProcessingState } from './replySurface';
import type { ReactNode } from 'react';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { PostActionBarProps } from './PostActionBar';
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
  mediaPresentation = 'default',
  onMediaViewerVisibilityChange,
  onDeleted,
  post: postKey,
  viewerWideDetail,
}: {
  mediaPresentation?: 'default' | 'hidden';
  onMediaViewerVisibilityChange?: (visible: boolean) => void;
  onDeleted?: () => void;
  post: PostLayout_post$key;
  viewerWideDetail?: ReactNode;
}) {
  const theme = useTheme();
  const { revision: actorRevision } = useRelayActor();
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
  const viewerIdentity = content
    ? `${actorRevision}:${post.profile.id}:${post.id}:${content.id}`
    : '';
  const viewerMedia =
    content?.media?.map(({ altText, id, url }) => ({
      altText: altText ?? null,
      id,
      url: url ?? null,
    })) ?? null;
  const activeViewerSession = reconcilePostMediaViewerSession(
    viewerSession,
    viewerIdentity,
    Boolean(viewerMedia?.length),
  );
  const closeViewer = useCallback(() => setViewerSession(null), []);
  const handleMediaUnavailable = useCallback(() => {
    if (viewerSession) {
      setViewerSession(null);
      requestAnimationFrame(() => focusPostMediaViewerTarget(surfaceRef));
    }
  }, [viewerSession]);
  const handleMediaOpen = useCallback<PostMediaOpenHandler>(
    (selectedIndex, originControl) => {
      if (viewerIdentity) {
        setViewerSession(
          createPostMediaViewerSession(viewerIdentity, selectedIndex, originControl),
        );
      }
    },
    [viewerIdentity],
  );
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
  useEffect(() => {
    if (viewerSession && !activeViewerSession) {
      setViewerSession(null);
      requestAnimationFrame(() => focusPostMediaViewerTarget(surfaceRef));
    }
  }, [activeViewerSession, viewerSession]);
  useEffect(() => {
    onMediaViewerVisibilityChange?.(Boolean(activeViewerSession));
  }, [activeViewerSession, onMediaViewerVisibilityChange]);
  useEffect(
    () => () => {
      onMediaViewerVisibilityChange?.(false);
    },
    [onMediaViewerVisibilityChange],
  );
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
            mediaPresentation={mediaPresentation}
            onMediaOpen={mediaPresentation === 'hidden' ? undefined : handleMediaOpen}
            onMediaUnavailable={mediaPresentation === 'hidden' ? undefined : handleMediaUnavailable}
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
      {mediaPresentation === 'default' && activeViewerSession && content && viewerMedia ? (
        <PostMediaViewer
          actionBar={
            <PostActionSurface
              onDeleted={handleDeleted}
              reactionSummaryStyle={styles.viewerReactionSummary}
              reply={viewerReply}
              socialActionTarget={socialActionTarget!}
            />
          }
          bodyText={content.bodyText}
          contentId={content.id}
          fallbackFocus={surfaceRef}
          media={viewerMedia}
          onClose={closeViewer}
          originControl={activeViewerSession.originControl}
          profile={{
            avatarUrl: post.profile.avatar?.url ?? null,
            displayName: post.profile.displayName,
            relativeHandle: post.profile.relativeHandle,
          }}
          selectedIndex={activeViewerSession.selectedIndex}
          wideDetail={viewerWideDetail}
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
