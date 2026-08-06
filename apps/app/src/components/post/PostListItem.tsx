import { Link, useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
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
import { PostMediaViewerThread } from './PostMediaViewerThread';
import { usePostReplyBinding } from './PostReplyCoordinator';
import { PostSourcePresentationView } from './PostSourcePresentationView';
import { ReplyComposerSurface } from './ReplyComposerSurface';
import { getReplyProcessingState } from './replySurface';
import type { ReactNode } from 'react';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';
import type { PostListRow_post$key } from './__generated__/PostListRow_post.graphql';
import type { PostActionBarProps } from './PostActionBar';
import type { PostMediaOpenHandler } from './PostMediaImage';
import type { PostMediaViewerSession } from './postMediaViewerSession';
import type { PostSourcePresentationData } from './PostSourcePresentationView';

const PostListRowFragment = graphql`
  fragment PostListRow_post on Post {
    id
    createdAt
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
    ...PostActionSurface_post @alias(as: "actionSurface")
    ...PostBody_post
    ...PostMediaViewer_post
  }
`;

const PostListItemFragment = graphql`
  fragment PostListItem_post on Post {
    id
    createdAt
    content {
      id
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
      id
      handle
      relativeHandle
      displayName
    }
    replyParent {
      id
      profile {
        displayName
      }
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
      ...PostListRow_post
    }
    ...PostListRow_post
  }
`;

export function PostListItem({
  post: postKey,
  showDivider = true,
  showReplyAttribution = true,
}: {
  post: PostListItem_post$key;
  showDivider?: boolean;
  showReplyAttribution?: boolean;
}) {
  const theme = useTheme();
  const { revision: actorRevision } = useRelayActor();
  const [deleted, setDeleted] = useState(false);
  const [quoteViewerSession, setQuoteViewerSession] = useState<PostMediaViewerSession | null>(null);
  const post = useFragment(PostListItemFragment, postKey);
  const replyBinding = usePostReplyBinding(post.id);
  const onDeleted = useCallback(() => {
    setQuoteViewerSession(null);
    setDeleted(true);
  }, []);
  const replyAuthentication = usePostActionAuthentication(Boolean(post.content));
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const replyTriggerRef = useRef<View>(null);
  const quoteSurfaceRef = useRef<View>(null);
  const reply = replyBinding
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
  const replySurface =
    replyAuthentication.execution.kind === 'enabled' &&
    replyBinding?.profile &&
    post.content &&
    post.replySurface ? (
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
    ) : null;
  const presentedReplySurface =
    replySurface && replyBinding?.owner === 'detail' ? (
      <View style={styles.detailReplySurface}>{replySurface}</View>
    ) : (
      replySurface
    );
  const quoteContent = post.content;
  const quoteViewerIdentity = quoteContent
    ? `${actorRevision}:${post.profile.id}:${post.id}:${quoteContent.id}`
    : '';
  const quoteMedia =
    quoteContent?.media?.map(({ altText, id, url }) => ({
      altText: altText ?? null,
      id,
      url: url ?? null,
    })) ?? null;
  const activeQuoteViewerSession = reconcilePostMediaViewerSession(
    quoteViewerSession,
    quoteViewerIdentity,
    Boolean(quoteContent?.media?.length),
  );
  const closeQuoteViewer = useCallback(() => setQuoteViewerSession(null), []);
  const handleQuoteMediaUnavailable = useCallback(() => {
    if (quoteViewerSession) {
      setQuoteViewerSession(null);
      requestAnimationFrame(() => focusPostMediaViewerTarget(quoteSurfaceRef));
    }
  }, [quoteViewerSession]);
  const handleQuoteMediaOpen = useCallback<PostMediaOpenHandler>(
    (selectedIndex, originControl) => {
      if (quoteViewerIdentity) {
        setQuoteViewerSession(
          createPostMediaViewerSession(quoteViewerIdentity, selectedIndex, originControl),
        );
      }
    },
    [quoteViewerIdentity],
  );
  const quoteViewerReply = reply
    ? {
        ...reply,
        controlRef: undefined,
        onPress: () => {
          closeQuoteViewer();
          requestAnimationFrame(() => reply.onPress());
        },
      }
    : undefined;
  useEffect(() => {
    if (quoteViewerSession && !activeQuoteViewerSession) {
      setQuoteViewerSession(null);
      requestAnimationFrame(() => focusPostMediaViewerTarget(quoteSurfaceRef));
    }
  }, [activeQuoteViewerSession, quoteViewerSession]);
  const cardStyle = [
    styles.card,
    showDivider && styles.cardDivider,
    showDivider && { borderColor: theme.divider },
  ];
  const replyAttribution =
    showReplyAttribution && post.replyParent ? (
      <PostAttributionRow
        icon={
          <View
            aria-hidden
            accessibilityElementsHidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <MessageCircle color={theme.textSecondary} size={16} />
          </View>
        }
      >
        <Text numberOfLines={1} style={[styles.attributionLabel, { color: theme.textSecondary }]}>
          {post.replyParent.profile.displayName}님에게 답글
        </Text>
      </PostAttributionRow>
    ) : null;

  if (deleted) {
    return null;
  }

  if (!post.repostSource) {
    if (!post.content) {
      return null;
    }
    return (
      <>
        <View role="article" style={cardStyle}>
          {replyAttribution}
          <PostListRow onDeleted={onDeleted} post={post} reply={reply} />
        </View>
        {presentedReplySurface}
      </>
    );
  }

  if (!post.content && post.replyParent) {
    return null;
  }

  const source = post.repostSource;

  if (!post.content) {
    return (
      <>
        <View role="article" style={cardStyle}>
          <PostAttributionRow
            icon={<Text style={[styles.repeat, { color: theme.textSecondary }]}>↻</Text>}
          >
            <Link asChild href={profileHref}>
              <Pressable
                accessibilityLabel={`${post.profile.displayName} 프로필 보기`}
                accessibilityRole="link"
                style={styles.repostLabelTarget}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.attributionLabel, { color: theme.textSecondary }]}
                >
                  {post.profile.displayName}님이 재게시함
                </Text>
              </Pressable>
            </Link>
          </PostAttributionRow>
          <PostListRow onDeleted={onDeleted} post={source} reply={reply} />
        </View>
        {presentedReplySurface}
      </>
    );
  }

  const presentationPost: PostSourcePresentationData = {
    content: {
      bodyText: post.content.bodyText,
      contentWarning: post.content.contentWarning,
      document: post.content.document,
      media: quoteMedia,
      postId: post.id,
    },
    createdAt: post.createdAt,
    id: post.id,
    profile: {
      displayName: post.profile.displayName,
      handle: post.profile.handle,
      relativeHandle: post.profile.relativeHandle,
      avatar: post.profile.avatar,
    },
    replyParent: post.replyParent ? { id: post.replyParent.id } : null,
    repostSource: {
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
    },
  };

  return (
    <>
      <View ref={quoteSurfaceRef} style={cardStyle} tabIndex={-1}>
        {replyAttribution}
        <View style={styles.quoteRow}>
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
          <View style={styles.sourcePresentation}>
            <PostSourcePresentationView
              onMediaOpen={handleQuoteMediaOpen}
              onMediaUnavailable={handleQuoteMediaUnavailable}
              post={presentationPost}
              showPostAvatar={false}
              sourcePreviewStyle={styles.quoteSourcePreview}
            />
            <PostActionSurface
              actionBarStyle={styles.actionBarSlot}
              onDeleted={onDeleted}
              reactionSummaryStyle={styles.quoteReactionSummary}
              reply={reply}
              socialActionTarget={post.actionSurface!}
            />
          </View>
        </View>
        {activeQuoteViewerSession && quoteContent ? (
          <PostMediaViewer
            actionBar={
              <PostActionSurface
                onDeleted={onDeleted}
                reactionSummaryStyle={styles.viewerReactionSummary}
                reply={quoteViewerReply}
                socialActionTarget={post.actionSurface!}
              />
            }
            fallbackFocus={quoteSurfaceRef}
            onClose={closeQuoteViewer}
            originControl={activeQuoteViewerSession.originControl}
            post={post}
            selectedIndex={activeQuoteViewerSession.selectedIndex}
            wideDetail={
              <PostMediaViewerThread
                contentId={quoteContent.id}
                onPostDeleted={onDeleted}
                onUnavailable={handleQuoteMediaUnavailable}
                postId={post.id}
              />
            }
          />
        ) : null}
      </View>
      {presentedReplySurface}
    </>
  );
}

function PostAttributionRow({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <View style={styles.attributionRow}>
      <View style={styles.attributionIconColumn}>{icon}</View>
      <View style={styles.attributionContent}>{children}</View>
    </View>
  );
}

function PostListRow({
  onDeleted,
  post: postKey,
  reply,
}: {
  onDeleted: () => void;
  post: PostListRow_post$key;
  reply?: PostActionBarProps['reply'];
}) {
  const router = useRouter();
  const theme = useTheme();
  const { revision: actorRevision } = useRelayActor();
  const post = useFragment(PostListRowFragment, postKey);
  const [viewerSession, setViewerSession] = useState<PostMediaViewerSession | null>(null);
  const surfaceRef = useRef<View>(null);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const detailHref = `/${post.profile.relativeHandle}/${post.id}` as const;
  const content = post.content;
  const viewerIdentity = content
    ? `${actorRevision}:${post.profile.id}:${post.id}:${content.id}`
    : '';
  const activeViewerSession = reconcilePostMediaViewerSession(
    viewerSession,
    viewerIdentity,
    Boolean(content?.media?.length),
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
    onDeleted();
  }, [closeViewer, onDeleted]);
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

  return (
    <View ref={surfaceRef} style={styles.standardRow} tabIndex={-1} testID="post-list-standard-row">
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
          <ProfileNameBlock href={profileHref} profile={post.profile} />
          <Link asChild href={detailHref}>
            <Pressable accessibilityRole="link" style={styles.timeLink}>
              <Text style={[styles.time, { color: theme.textSecondary }]}>
                {formatTimelineTimestamp(post.createdAt)}
              </Text>
            </Pressable>
          </Link>
        </View>
        {post.content ? (
          <View style={styles.bodyLink}>
            <PostBody
              onBodyPress={() => router.push(detailHref)}
              onMediaOpen={handleMediaOpen}
              onMediaUnavailable={handleMediaUnavailable}
              post={post}
            />
          </View>
        ) : null}
        <PostActionSurface
          actionBarStyle={styles.actionBarSlot}
          onDeleted={handleDeleted}
          reactionSummaryStyle={styles.reactionSummary}
          reply={reply}
          socialActionTarget={post.actionSurface!}
        />
      </View>
      {activeViewerSession && content ? (
        <PostMediaViewer
          actionBar={
            <PostActionSurface
              onDeleted={handleDeleted}
              reactionSummaryStyle={styles.viewerReactionSummary}
              reply={viewerReply}
              socialActionTarget={post.actionSurface!}
            />
          }
          fallbackFocus={surfaceRef}
          onClose={closeViewer}
          originControl={activeViewerSession.originControl}
          post={post}
          selectedIndex={activeViewerSession.selectedIndex}
          wideDetail={
            <PostMediaViewerThread
              contentId={content.id}
              onPostDeleted={handleDeleted}
              onUnavailable={handleMediaUnavailable}
              postId={post.id}
            />
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  cardDivider: { borderBottomWidth: 1 },
  quoteRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  standardRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
  },
  avatar: { borderRadius: radii.full },
  actionBarSlot: { paddingBottom: spacing.xs },
  detailReplySurface: {
    marginLeft: spacing.xxl * 2,
    marginRight: spacing.sm,
  },
  reactionSummary: { marginTop: spacing.xs },
  quoteReactionSummary: { marginTop: spacing.sm },
  quoteSourcePreview: { paddingBottom: spacing.xs },
  content: { flex: 1, gap: spacing.xs, minWidth: 0 },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  timeLink: { borderRadius: radii.sm, flexShrink: 0 },
  time: {
    fontFamily: 'SUIT',
    minHeight: 44,
    minWidth: 44,
    paddingTop: 12,
    ...typography.sm,
  },
  bodyLink: { borderRadius: radii.sm, minWidth: 0 },
  viewerReactionSummary: { display: 'none' },
  sourcePresentation: { flex: 1, minWidth: 0 },
  attributionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
  },
  attributionIconColumn: { alignItems: 'flex-end', width: 48 },
  attributionContent: { flex: 1, minWidth: 0 },
  attributionLabel: { fontFamily: 'SUIT', ...typography.sm },
  repeat: { fontFamily: 'SUIT', ...typography.sm },
  repostLabelTarget: { minWidth: 0 },
});
