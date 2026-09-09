import { Link, useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, radii, spacing, typography } from '@/theme/tokens';
import { PostActionSurface } from './PostActionSurface';
import { PostBody } from './PostBody';
import { usePostMediaViewerHost } from './PostMediaViewerHost';
import { usePostReplySurface } from './PostReplySurface';
import { PostSourcePresentationView } from './PostSourcePresentationView';
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
    ...PostActionSurface_post @alias(as: "actionSurface")
    ...PostSourcePresentationView_post
    repostSource {
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
  const [deleted, setDeleted] = useState(false);
  const post = useFragment(PostListItemFragment, postKey);
  const openViewer = usePostMediaViewerHost();
  const onDeleted = useCallback(() => setDeleted(true), []);
  const { reply, replySurface, owner: replyOwner } = usePostReplySurface(post);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const presentedReplySurface =
    replySurface && replyOwner === 'detail' ? (
      <View style={styles.detailReplySurface}>{replySurface}</View>
    ) : (
      replySurface
    );
  const handleQuoteMediaOpen = useCallback<PostMediaOpenHandler>(
    (selectedIndex, originControl) => {
      openViewer({
        mediaOwnerPostId: post.id,
        onDeleted,
        originControl,
        selectedIndex,
        surfacePostId: post.id,
      });
    },
    [onDeleted, openViewer, post.id],
  );
  const standardCardStyle = [
    styles.card,
    styles.standardCard,
    showDivider && styles.cardDivider,
    showDivider && { borderColor: theme.borderSubtle },
  ];
  const compactCardStyle = [
    styles.card,
    styles.compactCard,
    showDivider && styles.cardDivider,
    showDivider && { borderColor: theme.borderSubtle },
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

  const renderWithReplySurface = (presentation: ReactNode) => (
    <>
      {presentation}
      {presentedReplySurface}
    </>
  );

  if (!post.repostSource) {
    if (!post.content) {
      return renderWithReplySurface(null);
    }
    return renderWithReplySurface(
      <View role="article" style={standardCardStyle}>
        {replyAttribution}
        <PostListRow
          actionBarStyle={styles.actionBarSlot}
          onDeleted={onDeleted}
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
        <PostListRow onDeleted={onDeleted} post={source} reply={reply} surfacePostId={post.id} />
      </View>,
    );
  }

  return renderWithReplySurface(
    <View style={compactCardStyle}>
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
            onDeleted={onDeleted}
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
  onDeleted,
  post: postKey,
  reply,
  surfacePostId,
}: {
  actionBarStyle?: StyleProp<ViewStyle>;
  onDeleted: () => void;
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
        onDeleted,
        originControl,
        selectedIndex,
        surfacePostId: surfacePostId ?? post.id,
      });
    },
    [onDeleted, openViewer, post.id, surfacePostId],
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
          onDeleted={onDeleted}
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
  standardCard: { paddingBottom: spacing.xs, paddingTop: spacing.md },
  compactCard: { paddingBottom: 1, paddingTop: spacing.sm },
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
});
