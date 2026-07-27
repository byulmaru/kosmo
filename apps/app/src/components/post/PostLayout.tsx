import { Link, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { formatPostDate } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostBody } from './PostBody';
import { PostSourcePreview } from './PostSourcePresentationView';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type {
  PostPresentationLinkRenderer,
  PostPresentationLinkTarget,
  SourcePostPresentationData,
} from './PostSourcePresentationView';

const PostLayoutFragment = graphql`
  fragment PostLayout_post on Post {
    id
    createdAt
    visibility
    profile {
      id
      handle
      relativeHandle
      displayName
      ...ProfileNameBlock_profile
    }
    repostSource {
      id
      createdAt
      content {
        bodyText
        document
      }
      profile {
        displayName
        handle
        relativeHandle
      }
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

export function PostLayout({ post: postKey }: { post: PostLayout_post$key }) {
  const router = useRouter();
  const theme = useTheme();
  const post = useFragment(PostLayoutFragment, postKey);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const detailHref = `/${post.profile.relativeHandle}/${post.id}` as const;
  const source = post.repostSource;
  const sourceProfileHref = source ? (`/${source.profile.relativeHandle}` as const) : null;
  const sourcePostHref = source
    ? (`/${source.profile.relativeHandle}/${source.id}` as const)
    : null;
  const hrefs =
    sourceProfileHref && sourcePostHref
      ? ({
          postAuthor: profileHref,
          postDetail: detailHref,
          sourceAuthor: sourceProfileHref,
          sourcePost: sourcePostHref,
        } satisfies Record<PostPresentationLinkTarget, string>)
      : null;
  const renderLink: PostPresentationLinkRenderer = ({ accessibilityLabel, children, target }) => {
    const href = hrefs?.[target];
    if (!href) {
      throw new Error('Post detail Source link requires a visible direct Source.');
    }

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
  };
  const presentationSource: SourcePostPresentationData | null = source
    ? {
        content: source.content
          ? { bodyText: source.content.bodyText, document: source.content.document }
          : null,
        createdAt: source.createdAt,
        id: source.id,
        profile: {
          displayName: source.profile.displayName,
          handle: source.profile.handle,
          relativeHandle: source.profile.relativeHandle,
        },
      }
    : null;

  return (
    <View style={styles.root}>
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
          <Avatar label={post.profile.displayName || post.profile.handle} size={40} />
        </Pressable>
      </Link>
      <View style={styles.content}>
        <ProfileNameBlock href={profileHref} profile={post.profile} />
        <View style={styles.body}>
          <PostBody post={post} size="lg" />
          {presentationSource && sourcePostHref ? (
            <PostSourcePreview
              onSourcePostPress={() => router.push(sourcePostHref)}
              renderLink={renderLink}
              source={presentationSource}
              style={styles.source}
            />
          ) : null}
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {formatPostDate(post.createdAt)} ·{' '}
            {visibilityLabels[post.visibility] ?? post.visibility}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  avatar: { borderRadius: radii.full },
  content: { flex: 1, gap: spacing.xs, minWidth: 0 },
  body: { minWidth: 0 },
  meta: { fontFamily: 'SUIT', marginTop: 6, textAlign: 'right', ...typography.xsm },
  presentationLink: { minWidth: 0 },
  source: { marginTop: spacing.sm },
});
