import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostContentRenderer } from './PostContentRenderer';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type PostPresentationLinkTarget =
  | 'postAuthor'
  | 'postDetail'
  | 'sourceAuthor'
  | 'sourcePost';

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
  onPostPress,
  onSourcePostPress,
  post,
  renderLink,
}: {
  onPostPress: () => void;
  onSourcePostPress: () => void;
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
  const postTimestamp = renderLink({
    accessibilityLabel: `${post.profile.displayName}의 게시글 보기`,
    children: (
      <Text style={[styles.timestamp, { color: theme.textSecondary }]} testID="post-timestamp">
        {formatTimelineTimestamp(post.createdAt)}
      </Text>
    ),
    target: 'postDetail',
  });
  const postHeader = (
    <View style={styles.authorHeader}>
      <View style={styles.authorSlot}>{postAuthor}</View>
      {postTimestamp}
    </View>
  );

  if (kind === 'ordinary') {
    if (!post.content) {
      return null;
    }

    return (
      <View role="article" style={styles.root} testID="post-source-presentation">
        {postHeader}
        <PostBodyPressTarget content={post.content} onPress={onPostPress} testID="post-body" />
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
  const postBody = post.content ? (
    <PostBodyPressTarget content={post.content} onPress={onPostPress} testID="post-body" />
  ) : null;
  const sourceBody = source.content ? (
    <PostBodyPressTarget
      content={source.content}
      onPress={onSourcePostPress}
      style={styles.sourceBody}
      testID="source-post-body"
    />
  ) : null;

  if (kind === 'repost') {
    return (
      <View role="article" style={styles.root} testID="post-source-presentation">
        <View style={styles.repostAttribution}>
          <View style={styles.repostIconColumn}>
            <Text style={[styles.repeat, { color: theme.textSecondary }]}>↻</Text>
          </View>
          {renderLink({
            accessibilityLabel: `${post.profile.displayName} 프로필 보기`,
            children: (
              <View style={styles.repostLabelTarget}>
                <Text style={[styles.repostLabel, { color: theme.textSecondary }]}>
                  {post.profile.displayName}님이 재게시함
                </Text>
              </View>
            ),
            target: 'postAuthor',
          })}
        </View>
        <View style={styles.authorHeader}>
          <View style={styles.authorSlot}>{sourceAuthor}</View>
          {sourceTimestamp}
        </View>
        {sourceBody}
      </View>
    );
  }

  if (!post.content) {
    return null;
  }

  return (
    <View role="article" style={styles.root} testID="post-source-presentation">
      {postHeader}
      {postBody}
      <View style={[styles.preview, { borderColor: theme.border }]} testID="source-post-preview">
        <View style={styles.authorHeader}>
          <View style={styles.authorSlot}>{sourceAuthor}</View>
          {sourceTimestamp}
        </View>
        {sourceBody}
      </View>
    </View>
  );
}

function PostBodyPressTarget({
  content,
  onPress,
  style,
  testID,
}: {
  content: PresentationContent;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID: string;
}) {
  return (
    <Pressable
      accessible={false}
      focusable={false}
      onPress={onPress}
      style={style}
      tabIndex={-1}
      testID={testID}
    >
      <PostContentRenderer bodyText={content.bodyText} document={content.document} size="md" />
    </Pressable>
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
  repostAttribution: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: -spacing.sm,
    minHeight: 44,
  },
  repostIconColumn: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    minHeight: 44,
    width: 40,
  },
  repeat: { fontFamily: 'SUIT', ...typography.sm },
  repostLabelTarget: { justifyContent: 'flex-end', minHeight: 44 },
  repostLabel: {
    fontFamily: 'SUIT',
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
  sourceBody: { justifyContent: 'center', minHeight: 44, minWidth: 0 },
  preview: { borderRadius: radii.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
});
