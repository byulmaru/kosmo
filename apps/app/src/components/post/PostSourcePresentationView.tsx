import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostContentRenderer } from './PostContentRenderer';
import type { ReactNode } from 'react';

export type PostPresentationLinkTarget = 'postAuthor' | 'sourceAuthor' | 'sourcePost';

export type PostPresentationLinkRenderer = (props: {
  accessibilityLabel: string;
  children: ReactNode;
  target: PostPresentationLinkTarget;
}) => ReactNode;

export type PresentationProfile = {
  readonly displayName: string;
  readonly handle: string;
  readonly relativeHandle: string;
};

export type PresentationContent = {
  readonly bodyText: string;
  readonly document: unknown;
};

export type SourcePostPresentationData = {
  readonly content: PresentationContent | null;
  readonly createdAt: string;
  readonly id: string;
  readonly profile: PresentationProfile;
};

export type PostSourcePresentationData = {
  readonly content: PresentationContent | null;
  readonly createdAt: string;
  readonly id: string;
  readonly profile: PresentationProfile;
  readonly replyParent: { readonly id: string } | null;
  readonly repostSource: SourcePostPresentationData | null;
};

type PresentationKind = 'invalid' | 'ordinary' | 'quote' | 'repost';

function presentationKind(post: PostSourcePresentationData): PresentationKind {
  if (!post.repostSource) {
    return post.content ? 'ordinary' : 'invalid';
  }
  if (post.content) {
    return 'quote';
  }
  return post.replyParent ? 'invalid' : 'repost';
}

export function PostSourcePresentationView({
  post,
  renderLink,
}: {
  post: PostSourcePresentationData;
  renderLink: PostPresentationLinkRenderer;
}): ReactNode {
  const theme = useTheme();
  const kind = presentationKind(post);

  if (kind === 'invalid') {
    return null;
  }

  const postAuthor = renderLink({
    accessibilityLabel: `${post.profile.displayName} 프로필 보기`,
    children: <Author profile={post.profile} showAvatar={kind !== 'repost'} />,
    target: 'postAuthor',
  });
  const postHeader = (
    <View style={styles.authorHeader}>
      <View style={styles.authorSlot}>{postAuthor}</View>
      <Text style={[styles.timestamp, { color: theme.textSecondary }]} testID="post-timestamp">
        {formatTimelineTimestamp(post.createdAt)}
      </Text>
    </View>
  );

  if (kind === 'ordinary') {
    const content = post.content;
    if (!content) {
      return null;
    }

    return (
      <View role="article" style={styles.root} testID="post-source-presentation">
        {postHeader}
        <PostContentRenderer bodyText={content.bodyText} document={content.document} size="md" />
      </View>
    );
  }

  const source = post.repostSource;
  if (!source) {
    return null;
  }

  const sourceAuthor = renderLink({
    accessibilityLabel: `${source.profile.displayName} 프로필 보기`,
    children: <Author profile={source.profile} showAvatar />,
    target: 'sourceAuthor',
  });
  const sourceTimestamp = renderLink({
    accessibilityLabel: '원문 게시글 보기',
    children: (
      <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
        {formatTimelineTimestamp(source.createdAt)}
      </Text>
    ),
    target: 'sourcePost',
  });

  if (kind === 'repost') {
    return (
      <View role="article" style={styles.root} testID="post-source-presentation">
        <View style={styles.repostAttribution}>
          <Text style={[styles.repeat, { color: theme.textSecondary }]}>↻</Text>
          {renderLink({
            accessibilityLabel: `${post.profile.displayName} 프로필 보기`,
            children: (
              <Text style={[styles.repostLabel, { color: theme.textSecondary }]}>
                {post.profile.displayName}님이 재게시함
              </Text>
            ),
            target: 'postAuthor',
          })}
        </View>
        <View style={styles.authorHeader}>
          <View style={styles.authorSlot}>{sourceAuthor}</View>
          {sourceTimestamp}
        </View>
        {source.content ? (
          <View style={styles.sourceBody}>
            <PostContentRenderer
              bodyText={source.content.bodyText}
              document={source.content.document}
              size="md"
            />
          </View>
        ) : null}
      </View>
    );
  }

  const content = post.content;
  if (!content) {
    return null;
  }

  return (
    <View role="article" style={styles.root} testID="post-source-presentation">
      {postHeader}
      <PostContentRenderer bodyText={content.bodyText} document={content.document} size="md" />
      <View style={[styles.preview, { borderColor: theme.border }]} testID="source-post-preview">
        <View style={styles.authorHeader}>
          <View style={styles.authorSlot}>{sourceAuthor}</View>
          {sourceTimestamp}
        </View>
        {source.content ? (
          <View style={styles.sourceBody}>
            <PostContentRenderer
              bodyText={source.content.bodyText}
              document={source.content.document}
              size="md"
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Author({ profile, showAvatar }: { profile: PresentationProfile; showAvatar: boolean }) {
  const theme = useTheme();

  return (
    <View style={styles.author}>
      {showAvatar ? <Avatar label={profile.displayName || profile.handle} size={40} /> : null}
      <View style={styles.authorText}>
        <Text numberOfLines={1} style={[styles.displayName, { color: theme.text }]}>
          {profile.displayName}
        </Text>
        <Text numberOfLines={1} style={[styles.handle, { color: theme.textSecondary }]}>
          {profile.relativeHandle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, minWidth: 0 },
  repostAttribution: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: 44 },
  repeat: { fontFamily: 'SUIT', ...typography.sm },
  repostLabel: {
    fontFamily: 'SUIT',
    fontWeight: '700',
    minHeight: 44,
    paddingTop: 12,
    ...typography.sm,
  },
  author: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    minWidth: 0,
  },
  authorText: { flex: 1, minWidth: 0 },
  displayName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  handle: { flexShrink: 1, fontFamily: 'SUIT', ...typography.xsm },
  authorHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
  authorSlot: { flex: 1, minWidth: 0 },
  timestamp: { fontFamily: 'SUIT', minHeight: 44, minWidth: 44, paddingTop: 12, ...typography.xsm },
  sourceBody: { minWidth: 0 },
  preview: { borderRadius: radii.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
});
