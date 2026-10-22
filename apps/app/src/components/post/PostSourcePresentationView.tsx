import { Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, radii, spacing, typography } from '@/theme/tokens';
import { PostContentRenderer } from './PostContentRenderer';
import { PostDetailBackground } from './PostDetailBackground';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ProfileNameBlock_profile$key } from '@/components/profile/__generated__/ProfileNameBlock_profile.graphql';
import type { PostContentMention_profile$key } from './__generated__/PostContentMention_profile.graphql';
import type { PostSourcePresentationView_post$key } from './__generated__/PostSourcePresentationView_post.graphql';
import type { PostSourcePreview_source$key } from './__generated__/PostSourcePreview_source.graphql';
import type { PostMediaItem, PostMediaOpenHandler } from './PostMediaImage';

type AuthorProfile = ProfileNameBlock_profile$key & {
  readonly avatar:
    | {
        readonly id: string;
        readonly url: string | null | undefined;
      }
    | null
    | undefined;
  readonly displayName: string;
  readonly handle: string;
};

type MentionedProfile = PostContentMention_profile$key & {
  readonly id: string;
};

type PresentationContent = {
  readonly bodyText: string;
  readonly contentWarning: string | null | undefined;
  readonly document: unknown;
  readonly media:
    | ReadonlyArray<{
        readonly altText: string | null | undefined;
        readonly id: string;
        readonly url: string | null | undefined;
      }>
    | null
    | undefined;
  readonly mentionedProfiles: ReadonlyArray<MentionedProfile>;
};

const PostSourcePreviewFragment = graphql`
  fragment PostSourcePreview_source on Post {
    id
    createdAt
    content {
      bodyText
      contentWarning
      document
      mentionedProfiles {
        id
        ...PostContentMention_profile
      }
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
      ...ProfileNameBlock_profile
    }
  }
`;

const PostSourcePresentationViewFragment = graphql`
  fragment PostSourcePresentationView_post on Post {
    id
    createdAt
    content {
      bodyText
      contentWarning
      document
      mentionedProfiles {
        id
        ...PostContentMention_profile
      }
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
      ...ProfileNameBlock_profile
    }
    repostSource {
      ...PostSourcePreview_source
    }
  }
`;

type PresentationKind = 'invalid' | 'ordinary' | 'quote';

function presentationKind(post: {
  readonly content: PresentationContent | null | undefined;
  readonly repostSource: PostSourcePreview_source$key | null | undefined;
}): PresentationKind {
  if (!post.repostSource) {
    return post.content ? 'ordinary' : 'invalid';
  }
  return post.content ? 'quote' : 'invalid';
}

export function PostSourcePresentationView({
  authorTopInset = 0,
  onBackgroundPress,
  onMediaOpen,
  post: postKey,
  showPostAvatar = true,
  sourcePreviewStyle,
}: {
  authorTopInset?: number;
  onBackgroundPress?: () => void;
  onMediaOpen?: PostMediaOpenHandler;
  post: PostSourcePresentationView_post$key;
  showPostAvatar?: boolean;
  sourcePreviewStyle?: StyleProp<ViewStyle>;
}): ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const post = useFragment(PostSourcePresentationViewFragment, postKey);
  const kind = presentationKind(post);

  const postProfileHref = `/${post.profile.relativeHandle}` as Href;
  const postDetailHref = `/${post.profile.relativeHandle}/${post.id}` as Href;
  const openPost = useCallback(() => router.push(postDetailHref), [postDetailHref, router]);
  if (kind === 'invalid') {
    return null;
  }
  const postHeader = (
    <PostDetailBackground onBackgroundPress={openPost} style={styles.authorHeader}>
      <PostDetailBackground onBackgroundPress={openPost} style={styles.authorSlot}>
        <PresentationLink
          accessibilityLabel={`${post.profile.displayName} 프로필 보기`}
          href={postProfileHref}
          resetScroll
          style={{ paddingTop: authorTopInset }}
        >
          <Author profile={post.profile} showAvatar={showPostAvatar} />
        </PresentationLink>
      </PostDetailBackground>
      <PresentationLink
        accessibilityLabel={`${post.profile.displayName}의 게시글 보기`}
        href={postDetailHref}
        style={{ paddingTop: authorTopInset }}
      >
        <Text
          style={[styles.timestamp, { color: theme.foregroundSecondary }]}
          testID="post-timestamp"
        >
          {formatTimelineTimestamp(post.createdAt)}
        </Text>
      </PresentationLink>
    </PostDetailBackground>
  );

  if (kind === 'ordinary') {
    if (!post.content) {
      return null;
    }

    return (
      <View role="article" style={styles.root} testID="post-source-presentation">
        {postHeader}
        <PostBodyPressTarget
          content={post.content}
          href={postDetailHref}
          onMediaOpen={onMediaOpen}
          postId={post.id}
          testID="post-body"
        />
      </View>
    );
  }

  const source = post.repostSource;
  if (!source || !post.content) {
    return null;
  }

  return (
    <PostDetailBackground
      onBackgroundPress={onBackgroundPress}
      role="article"
      style={styles.root}
      testID="post-source-presentation"
    >
      {postHeader}
      <PostBodyPressTarget
        content={post.content}
        href={postDetailHref}
        onMediaOpen={onMediaOpen}
        postId={post.id}
        testID="post-body"
      />
      <PostSourcePreview source={source} style={sourcePreviewStyle} />
    </PostDetailBackground>
  );
}

export function PostSourcePreview({
  interactive = true,
  source: sourceKey,
  style,
}: {
  interactive?: boolean;
  source: PostSourcePreview_source$key;
  style?: StyleProp<ViewStyle>;
}): ReactNode {
  const theme = useTheme();
  const [pointerHovered, setPointerHovered] = useState(false);
  const router = useRouter();
  const source = useFragment(PostSourcePreviewFragment, sourceKey);
  const sourceProfileHref = `/${source.profile.relativeHandle}` as Href;
  const sourcePostHref = `/${source.profile.relativeHandle}/${source.id}` as Href;
  const previewStyle = [styles.preview, style, { borderColor: theme.borderDefault }];
  const authorTopInset = interactive ? spacing.md : 0;
  const openSource = useCallback(() => router.push(sourcePostHref), [router, sourcePostHref]);
  if (!interactive && pointerHovered) {
    setPointerHovered(false);
  }
  const content = (
    <>
      <PostDetailBackground
        onBackgroundPress={interactive ? openSource : undefined}
        style={[styles.authorHeader, { marginTop: -authorTopInset }]}
      >
        <PostDetailBackground
          onBackgroundPress={interactive ? openSource : undefined}
          style={styles.authorSlot}
        >
          {interactive ? (
            <PresentationLink
              accessibilityLabel={`${source.profile.displayName} 프로필 보기`}
              href={sourceProfileHref}
              resetScroll
              style={{ paddingTop: authorTopInset }}
            >
              <Author profile={source.profile} showAvatar />
            </PresentationLink>
          ) : (
            <Author profile={source.profile} showAvatar />
          )}
        </PostDetailBackground>
        {interactive ? (
          <PresentationLink
            accessibilityLabel="원문 게시글 보기"
            href={sourcePostHref}
            style={{ paddingTop: authorTopInset }}
          >
            <Text style={[styles.timestamp, { color: theme.foregroundSecondary }]}>
              {formatTimelineTimestamp(source.createdAt)}
            </Text>
          </PresentationLink>
        ) : (
          <Text style={[styles.timestamp, { color: theme.foregroundSecondary }]}>
            {formatTimelineTimestamp(source.createdAt)}
          </Text>
        )}
      </PostDetailBackground>
      {source.content && interactive ? (
        <PostBodyPressTarget
          content={source.content}
          href={sourcePostHref}
          postId={source.id}
          style={styles.sourceBody}
          testID="source-post-body"
        />
      ) : source.content ? (
        <View style={styles.sourceBody} testID="source-post-body">
          <PostContentRenderer
            bodyText={source.content.bodyText}
            contentWarning={source.content.contentWarning}
            document={source.content.document}
            interactive={false}
            media={presentationMedia(source.content.media)}
            mentionedProfiles={source.content.mentionedProfiles}
            postId={source.id}
            size="md"
          />
        </View>
      ) : null}
    </>
  );

  if (!interactive || Platform.OS !== 'web') {
    return (
      <View style={previewStyle} testID="source-post-preview">
        {content}
      </View>
    );
  }

  // RNW suppresses an ancestor Pressable's hovered state under a nested Pressable.
  return (
    <Pressable
      accessible={false}
      focusable={false}
      onPointerEnter={(event) => {
        if (event.nativeEvent.pointerType !== 'touch') {
          setPointerHovered(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.nativeEvent.pointerType !== 'touch') {
          setPointerHovered(false);
        }
      }}
      style={[
        ...previewStyle,
        {
          backgroundColor: pointerHovered ? theme.stateHover : undefined,
          cursor: 'auto',
        },
      ]}
      tabIndex={-1}
      testID="source-post-preview"
    >
      {content}
    </Pressable>
  );
}

function PresentationLink({
  accessibilityLabel,
  children,
  href,
  resetScroll = false,
  style,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  href: Href;
  resetScroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const trigger = (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="link"
      style={[styles.presentationLink, style]}
    >
      {children}
    </Pressable>
  );

  return resetScroll ? (
    <NavigationLink resetScroll href={href} push={Platform.OS !== 'web'}>
      {trigger}
    </NavigationLink>
  ) : (
    <Link asChild href={href} push={Platform.OS !== 'web'}>
      {trigger}
    </Link>
  );
}

function PostBodyPressTarget({
  content,
  href,
  onMediaOpen,
  postId,
  style,
  testID,
}: {
  content: PresentationContent;
  href: Href;
  onMediaOpen?: PostMediaOpenHandler;
  postId: string;
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
        contentWarning={content.contentWarning}
        document={content.document}
        media={presentationMedia(content.media)}
        mentionedProfiles={content.mentionedProfiles}
        onMediaOpen={onMediaOpen}
        postId={postId}
        size="md"
      />
    </Pressable>
  );
}

function presentationMedia(
  media: PresentationContent['media'],
): ReadonlyArray<PostMediaItem> | null {
  return (
    media?.map(({ altText, id, url }) => ({
      altText: altText ?? null,
      id,
      url: url ?? null,
    })) ?? null
  );
}

function Author({ profile, showAvatar }: { profile: AuthorProfile; showAvatar: boolean }) {
  return (
    <View style={styles.author}>
      {showAvatar ? (
        <Avatar
          imageUri={profile.avatar?.url}
          label={profile.displayName || profile.handle}
          size={40}
        />
      ) : null}
      <ProfileNameBlock profile={profile} style={styles.authorText} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, minWidth: 0 },
  author: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    maxWidth: '100%',
    minHeight: 44,
    minWidth: 0,
  },
  authorText: { flex: -1, minWidth: 0 },
  authorHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
  authorSlot: { alignItems: 'flex-start', flex: 1, minWidth: 0 },
  timestamp: {
    fontFamily: fontFamilies.ui,
    minHeight: 44,
    minWidth: 44,
    paddingTop: 12,
    textAlign: 'right',
    ...typography.xsm,
  },
  sourceBody: { justifyContent: 'center', minHeight: 44, minWidth: 0 },
  preview: { borderRadius: radii.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  presentationLink: { maxWidth: '100%', minWidth: 0 },
});
