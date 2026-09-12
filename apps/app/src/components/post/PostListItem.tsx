import { Link, useRouter } from 'expo-router';
import { MessageCircle, Pin } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, radii, spacing, typography } from '@/theme/tokens';
import { PostActionSurface } from './PostActionSurface';
import { PostBody } from './PostBody';
import { usePostComposerBinding } from './PostComposerCoordinator';
import { usePostMediaViewerHost } from './PostMediaViewerHost';
import { usePostReplySurface } from './PostReplySurface';
import { PostSourcePresentationView } from './PostSourcePresentationView';
import { ReplyComposerSurface } from './ReplyComposerSurface';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';
import type { PostListRow_post$key } from './__generated__/PostListRow_post.graphql';
import type { PostActionBarProps } from './PostActionBar';
import type { PostMediaOpenHandler } from './PostMediaImage';

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
    ...ReplyComposerSurface_parent @alias(as: "quoteSurface")
    ...PostActionSurface_post @alias(as: "actionSurface")
    ...PostBody_post
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
    ...PostReplySurface_post
    ...ReplyComposerSurface_parent @alias(as: "quoteSurface")
    ...PostActionSurface_post @alias(as: "actionSurface")
    ...PostSourcePresentationView_post
    repostSource {
      ...PostListRow_post
      ...ReplyComposerSurface_parent @alias(as: "quoteSurface")
    }
    ...PostListRow_post
  }
`;

export function PostListItem({
  pinned = false,
  post: postKey,
  showDivider = true,
  showReplyAttribution = true,
}: {
  pinned?: boolean;
  post: PostListItem_post$key;
  showDivider?: boolean;
  showReplyAttribution?: boolean;
}) {
  const theme = useTheme();
  const restoreQuoteTriggerFocusRef = useRef<(() => void) | null>(null);
  const post = useFragment(PostListItemFragment, postKey);
  const openViewer = usePostMediaViewerHost();
  const {
    binding: replyBinding,
    reply,
    replySurface,
    owner: replyOwner,
  } = usePostReplySurface(post);
  const quoteBinding = usePostComposerBinding(post.id, 'quote');
  const composerExpandedRef = useRef(false);
  composerExpandedRef.current = Boolean(replyBinding?.expanded || quoteBinding?.expanded);
  const pureRepost = !post.content && !post.replyParent && post.repostSource;
  const quoteParent = pureRepost ? post.repostSource?.quoteSurface : post.quoteSurface;
  const openQuote = useCallback(
    (restoreFocus: () => void) => {
      if (replyBinding?.profile && quoteParent) {
        restoreQuoteTriggerFocusRef.current = restoreFocus;
        quoteBinding?.onPress();
      }
    },
    [quoteBinding, quoteParent, replyBinding?.profile],
  );
  const closeQuote = useCallback(
    (willContinue = false) => {
      quoteBinding?.onRequestClose();
      if (!willContinue) {
        requestAnimationFrame(() => {
          if (!composerExpandedRef.current) {
            restoreQuoteTriggerFocusRef.current?.();
          }
        });
      }
    },
    [quoteBinding],
  );
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const presentedReplySurface =
    replySurface && replyOwner === 'detail' ? (
      <View style={styles.detailReplySurface}>{replySurface}</View>
    ) : (
      replySurface
    );
  const quoteSurface =
    quoteBinding?.expanded && quoteParent && quoteBinding.profile ? (
      <ReplyComposerSurface
        ref={quoteBinding.surfaceRef}
        mode="quote"
        onRequestClose={closeQuote}
        open
        owner={quoteBinding.owner}
        parent={quoteParent}
        profile={quoteBinding.profile}
      />
    ) : null;
  const handleQuoteMediaOpen = useCallback<PostMediaOpenHandler>(
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
  const standardCardStyle = [
    Platform.OS === 'web' ? styles.card : styles.nativeCard,
    styles.standardCard,
    Platform.OS === 'web' && styles.webCardBottom,
    showDivider && styles.cardDivider,
    showDivider && { borderColor: theme.borderSubtle },
  ];
  const compactCardStyle = [
    Platform.OS === 'web' ? styles.card : styles.nativeCard,
    styles.compactCard,
    Platform.OS === 'web' && styles.webCardBottom,
    showDivider && styles.cardDivider,
    showDivider && { borderColor: theme.borderSubtle },
  ];
  const pinnedAttribution = pinned ? (
    <View style={styles.pinnedAttribution}>
      <PostAttributionRow
        icon={
          <View
            aria-hidden
            accessibilityElementsHidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Pin color={theme.textSecondary} size={16} />
          </View>
        }
      >
        <Text style={[styles.attributionLabel, { color: theme.textSecondary }]}>고정됨</Text>
      </PostAttributionRow>
    </View>
  ) : null;
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

  const renderWithReplySurface = (presentation: ReactNode) => (
    <>
      {presentation}
      {presentedReplySurface}
      {quoteSurface}
    </>
  );

  if (!post.repostSource) {
    if (!post.content) {
      return renderWithReplySurface(null);
    }
    return renderWithReplySurface(
      <View role="article" style={standardCardStyle}>
        {pinnedAttribution}
        {replyAttribution}
        <PostListRow
          actionBarStyle={Platform.OS === 'web' ? styles.webActionBarSlot : styles.actionBarSlot}
          onQuote={openQuote}
          post={post}
          reply={reply}
        />
      </View>,
    );
  }

  if (!post.content && post.replyParent) {
    return renderWithReplySurface(null);
  }

  const source = post.repostSource;

  if (!post.content) {
    return renderWithReplySurface(
      <View role="article" style={compactCardStyle}>
        {pinnedAttribution}
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
        <PostListRow
          actionBarStyle={Platform.OS === 'web' ? styles.webActionBarSlot : undefined}
          onQuote={openQuote}
          post={source}
          reply={reply}
          surfacePostId={post.id}
        />
      </View>,
    );
  }

  return renderWithReplySurface(
    <View style={compactCardStyle}>
      {pinnedAttribution}
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
            post={post}
            showPostAvatar={false}
            sourcePreviewStyle={styles.quoteSourcePreview}
          />
          <PostActionSurface
            actionBarStyle={Platform.OS === 'web' ? styles.webQuoteActionBar : undefined}
            onQuote={openQuote}
            reactionSummaryStyle={styles.quoteReactionSummary}
            reply={reply}
            socialActionTarget={post.actionSurface!}
          />
        </View>
      </View>
    </View>,
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
  actionBarStyle,
  onQuote,
  post: postKey,
  reply,
  surfacePostId,
}: {
  actionBarStyle?: StyleProp<ViewStyle>;
  onQuote?: (restoreFocus: () => void) => void;
  post: PostListRow_post$key;
  reply?: PostActionBarProps['reply'];
  surfacePostId?: string;
}) {
  const router = useRouter();
  const theme = useTheme();
  const post = useFragment(PostListRowFragment, postKey);
  const openViewer = usePostMediaViewerHost();
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const detailHref = `/${post.profile.relativeHandle}/${post.id}` as const;
  const handleMediaOpen = useCallback<PostMediaOpenHandler>(
    (selectedIndex, originControl) => {
      openViewer({
        mediaOwnerPostId: post.id,
        originControl,
        selectedIndex,
        surfacePostId: surfacePostId ?? post.id,
      });
    },
    [openViewer, post.id, surfacePostId],
  );
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
            <PostBody
              onBodyPress={() => router.push(detailHref)}
              onMediaOpen={handleMediaOpen}
              post={post}
            />
          </View>
        ) : null}
        <PostActionSurface
          actionBarStyle={actionBarStyle}
          onQuote={onQuote}
          reactionSummaryStyle={styles.reactionSummary}
          reply={reply}
          socialActionTarget={post.actionSurface!}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.sm,
  },
  nativeCard: {
    paddingHorizontal: spacing.lg,
  },
  standardCard: { paddingBottom: spacing.xs, paddingTop: spacing.md },
  compactCard: { paddingBottom: 1, paddingTop: spacing.sm },
  webCardBottom: { paddingBottom: spacing.sm },
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
  actionBarSlot: { paddingTop: spacing.xs },
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
    fontFamily: fontFamilies.ui,
    minHeight: 44,
    minWidth: 44,
    paddingTop: 12,
    ...typography.sm,
  },
  bodyLink: { borderRadius: radii.sm, minWidth: 0 },
  sourcePresentation: { flex: 1, minWidth: 0 },
  pinnedAttribution: { paddingTop: spacing.xs },
  attributionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
  },
  attributionIconColumn: { alignItems: 'flex-end', width: 48 },
  attributionContent: { flex: 1, minWidth: 0 },
  attributionLabel: { fontFamily: fontFamilies.ui, ...typography.sm },
  repeat: { fontFamily: fontFamilies.ui, ...typography.sm },
  repostLabelTarget: { minWidth: 0 },
  webActionBarSlot: { paddingTop: spacing.sm },
  webQuoteActionBar: { paddingTop: spacing.md },
});
