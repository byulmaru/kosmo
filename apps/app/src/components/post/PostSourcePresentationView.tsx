import { Link, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostContentRenderer } from './PostContentRenderer';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type PresentationProfile = {
  readonly avatar:
    | {
        readonly id: string;
        readonly url: string | null | undefined;
      }
    | null
    | undefined;
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

type PresentationKind = 'invalid' | 'ordinary' | 'quote';

function presentationKind(post: PostSourcePresentationData): PresentationKind {
  if (!post.repostSource) {
    return post.content ? 'ordinary' : 'invalid';
  }
  return post.content ? 'quote' : 'invalid';
}

export function PostSourcePresentationView({
  post,
  showPostAvatar = true,
  sourcePreviewStyle,
}: {
  post: PostSourcePresentationData;
  showPostAvatar?: boolean;
  sourcePreviewStyle?: StyleProp<ViewStyle>;
}): ReactNode {
  const theme = useTheme();
  const kind = presentationKind(post);

  if (kind === 'invalid') {
    return null;
  }

  const postProfileHref = `/${post.profile.relativeHandle}` as Href;
  const postDetailHref = `/${post.profile.relativeHandle}/${post.id}` as Href;
  const postHeader = (
    <View style={styles.authorHeader}>
      <View style={styles.authorSlot}>
        <PresentationLink
          accessibilityLabel={`${post.profile.displayName} 프로필 보기`}
          href={postProfileHref}
        >
          <Author profile={post.profile} showAvatar={showPostAvatar} />
        </PresentationLink>
      </View>
      <PresentationLink
        accessibilityLabel={`${post.profile.displayName}의 게시글 보기`}
        href={postDetailHref}
      >
        <Text style={[styles.timestamp, { color: theme.textSecondary }]} testID="post-timestamp">
          {formatTimelineTimestamp(post.createdAt)}
        </Text>
      </PresentationLink>
    </View>
  );

  if (kind === 'ordinary') {
    if (!post.content) {
      return null;
    }

    return (
      <View role="article" style={styles.root} testID="post-source-presentation">
        {postHeader}
        <PostBodyPressTarget content={post.content} href={postDetailHref} testID="post-body" />
      </View>
    );
  }

  const source = post.repostSource;
  if (!source || !post.content) {
    return null;
  }

  return (
    <View role="article" style={styles.root} testID="post-source-presentation">
      {postHeader}
      <PostBodyPressTarget content={post.content} href={postDetailHref} testID="post-body" />
      <PostSourcePreview source={source} style={sourcePreviewStyle} />
    </View>
  );
}

export function PostSourcePreview({
  interactive = true,
  source,
  style,
}: {
  interactive?: boolean;
  source: SourcePostPresentationData;
  style?: StyleProp<ViewStyle>;
}): ReactNode {
  const theme = useTheme();
  const sourceProfileHref = `/${source.profile.relativeHandle}` as Href;
  const sourcePostHref = `/${source.profile.relativeHandle}/${source.id}` as Href;
  const content = (
    <>
      <View style={styles.authorHeader}>
        <View style={styles.authorSlot}>
          {interactive ? (
            <PresentationLink
              accessibilityLabel={`${source.profile.displayName} 프로필 보기`}
              href={sourceProfileHref}
            >
              <Author profile={source.profile} showAvatar />
            </PresentationLink>
          ) : (
            <Author profile={source.profile} showAvatar />
          )}
        </View>
        {interactive ? (
          <PresentationLink accessibilityLabel="원문 게시글 보기" href={sourcePostHref}>
            <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
              {formatTimelineTimestamp(source.createdAt)}
            </Text>
          </PresentationLink>
        ) : (
          <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
            {formatTimelineTimestamp(source.createdAt)}
          </Text>
        )}
      </View>
      {source.content && interactive ? (
        <PostBodyPressTarget
          content={source.content}
          href={sourcePostHref}
          style={styles.sourceBody}
          testID="source-post-body"
        />
      ) : source.content ? (
        <View style={styles.sourceBody} testID="source-post-body">
          <PostContentRenderer
            bodyText={source.content.bodyText}
            document={source.content.document}
            interactive={false}
            size="md"
          />
        </View>
      ) : null}
    </>
  );

  return (
    <View
      style={[styles.preview, style, { borderColor: theme.border }]}
      testID="source-post-preview"
    >
      {content}
    </View>
  );
}

function PresentationLink({
  accessibilityLabel,
  children,
  href,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  href: Href;
}) {
  return (
    <Link asChild href={href}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="link"
        style={styles.presentationLink}
      >
        {children}
      </Pressable>
    </Link>
  );
}

function PostBodyPressTarget({
  content,
  href,
  style,
  testID,
}: {
  content: PresentationContent;
  href: Href;
  style?: StyleProp<ViewStyle>;
  testID: string;
}) {
  const router = useRouter();

  return (
    <Pressable
      accessible={false}
      focusable={false}
      onPress={() => router.push(href)}
      style={style}
      tabIndex={-1}
      testID={testID}
    >
      <PostContentRenderer
        bodyText={content.bodyText}
        document={content.document}
        media={[]}
        size="md"
      />
    </Pressable>
  );
}

function Author({ profile, showAvatar }: { profile: PresentationProfile; showAvatar: boolean }) {
  const theme = useTheme();

  return (
    <View style={styles.author}>
      {showAvatar ? (
        <Avatar
          imageUri={profile.avatar?.url}
          label={profile.displayName || profile.handle}
          size={40}
        />
      ) : null}
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
  presentationLink: { minWidth: 0 },
});
