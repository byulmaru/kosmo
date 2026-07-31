import { Link, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostActionBar } from './PostActionBar';
import { PostBody } from './PostBody';
import { usePostReactionController } from './PostReactionController';
import { usePostReplyBinding } from './PostReplyCoordinator';
import { PostSourcePresentationView } from './PostSourcePresentationView';
import { ReplyComposerSurface } from './ReplyComposerSurface';
import { getReplyProcessingState } from './replySurface';
import { useRepostFailureToast } from './useRepostFailureToast';
import type { PostActionBar_post$key } from './__generated__/PostActionBar_post.graphql';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';
import type { PostListRow_post$key } from './__generated__/PostListRow_post.graphql';
import type { PostReactionController_post$key } from './__generated__/PostReactionController_post.graphql';
import type { PostActionBarProps } from './PostActionBar';
import type { PostSourcePresentationData } from './PostSourcePresentationView';

const PostListRowFragment = graphql`
  fragment PostListRow_post on Post {
    id
    createdAt
    content {
      bodyText
    }
    profile {
      avatar {
        id
        url
      }
      handle
      relativeHandle
      displayName
      ...ProfileNameBlock_profile
    }
    ...PostActionBar_post @alias(as: "actionBar")
    ...PostReactionController_post @alias(as: "reactionController")
    ...PostBody_post
  }
`;

const PostListItemFragment = graphql`
  fragment PostListItem_post on Post {
    id
    createdAt
    content {
      bodyText
      document
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
    }
    ...ReplyComposerSurface_parent @alias(as: "replySurface")
    ...PostActionBar_post @alias(as: "actionBar")
    ...PostReactionController_post @alias(as: "reactionController")
    repostSource {
      id
      createdAt
      content {
        bodyText
        document
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
}: {
  post: PostListItem_post$key;
  showDivider?: boolean;
}) {
  const theme = useTheme();
  const onRepostError = useRepostFailureToast();
  const [deleted, setDeleted] = useState(false);
  const post = useFragment(PostListItemFragment, postKey);
  const replyBinding = usePostReplyBinding(post.id);
  const onDeleted = useCallback(() => setDeleted(true), []);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const replyTriggerRef = useRef<View>(null);
  const reply = replyBinding
    ? {
        accessibilityLabel: '답글',
        controlRef: replyTriggerRef,
        expanded: replyBinding.expanded,
        onPress: replyBinding.onPress,
        processing: getReplyProcessingState(true, Boolean(post.content)),
      }
    : undefined;
  const replySurface =
    replyBinding && post.content && post.replySurface ? (
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
  const cardStyle = [
    styles.card,
    showDivider && styles.cardDivider,
    showDivider && { borderColor: theme.divider },
  ];

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
          <PostListRow
            onDeleted={onDeleted}
            onRepostError={onRepostError}
            post={post}
            reply={reply}
          />
        </View>
        {replySurface}
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
          <View style={styles.repostAttribution}>
            <View style={styles.repostIconColumn}>
              <Text style={[styles.repeat, { color: theme.textSecondary }]}>↻</Text>
            </View>
            <View style={styles.repostAuthorSlot}>
              <Link asChild href={profileHref}>
                <Pressable
                  accessibilityLabel={`${post.profile.displayName} 프로필 보기`}
                  accessibilityRole="link"
                  style={styles.repostLabelTarget}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.repostLabel, { color: theme.textSecondary }]}
                  >
                    {post.profile.displayName}님이 재게시함
                  </Text>
                </Pressable>
              </Link>
            </View>
          </View>
          <PostListRow
            onDeleted={onDeleted}
            onRepostError={onRepostError}
            post={source}
            reply={reply}
          />
        </View>
        {replySurface}
      </>
    );
  }

  const presentationPost: PostSourcePresentationData = {
    content: { bodyText: post.content.bodyText, document: post.content.document },
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
        ? { bodyText: source.content.bodyText, document: source.content.document }
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
      <View style={[...cardStyle, styles.quoteRow]}>
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
            post={presentationPost}
            showPostAvatar={false}
            sourcePreviewStyle={styles.quoteSourcePreview}
          />
          <PostReactionActions
            actionBar={post.actionBar!}
            controllerPost={post.reactionController!}
            onDeleted={onDeleted}
            onRepostError={onRepostError}
            quote
            reply={reply}
          />
        </View>
      </View>
      {replySurface}
    </>
  );
}

function PostListRow({
  onDeleted,
  onRepostError,
  post: postKey,
  reply,
}: {
  onDeleted: () => void;
  onRepostError: NonNullable<PostActionBarProps['onRepostError']>;
  post: PostListRow_post$key;
  reply?: PostActionBarProps['reply'];
}) {
  const router = useRouter();
  const theme = useTheme();
  const post = useFragment(PostListRowFragment, postKey);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const detailHref = `/${post.profile.relativeHandle}/${post.id}` as const;

  return (
    <View style={styles.standardRow} testID="post-list-standard-row">
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
            <PostBody onBodyPress={() => router.push(detailHref)} post={post} />
          </View>
        ) : null}
        <PostReactionActions
          actionBar={post.actionBar!}
          controllerPost={post.reactionController!}
          onDeleted={onDeleted}
          onRepostError={onRepostError}
          reply={reply}
        />
      </View>
    </View>
  );
}

function PostReactionActions({
  actionBar,
  controllerPost,
  onDeleted,
  onRepostError,
  quote = false,
  reply,
}: {
  actionBar: PostActionBar_post$key;
  controllerPost: PostReactionController_post$key;
  onDeleted?: () => void;
  onRepostError: NonNullable<PostActionBarProps['onRepostError']>;
  quote?: boolean;
  reply?: PostActionBarProps['reply'];
}) {
  const controller = usePostReactionController(controllerPost);

  return (
    <>
      <PostReactionSummary
        controller={controller}
        style={quote ? styles.quoteReactionSummary : styles.reactionSummary}
      />
      <View style={styles.actionBarSlot}>
        <PostActionBar
          onDeleted={onDeleted}
          onRepostError={onRepostError}
          post={actionBar}
          reactionController={controller}
          reply={reply}
        />
      </View>
    </>
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
  sourcePresentation: { flex: 1, minWidth: 0 },
  repostAttribution: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
  },
  repostIconColumn: { alignItems: 'flex-end', width: 48 },
  repeat: { fontFamily: 'SUIT', ...typography.sm },
  repostAuthorSlot: { flex: 1, minWidth: 0 },
  repostLabelTarget: { minWidth: 0 },
  repostLabel: { fontFamily: 'SUIT', ...typography.sm },
});
