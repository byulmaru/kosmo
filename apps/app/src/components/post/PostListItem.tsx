import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostBody } from './PostBody';
import { PostSourcePresentationView } from './PostSourcePresentationView';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';
import type {
  PostPresentationLinkRenderer,
  PostPresentationLinkTarget,
  PostSourcePresentationData,
} from './PostSourcePresentationView';

const PostListItemFragment = graphql`
  fragment PostListItem_post on Post {
    id
    createdAt
    content {
      bodyText
      document
    }
    profile {
      id
      handle
      relativeHandle
      displayName
      ...ProfileNameBlock_profile
    }
    replyParent {
      id
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
      repostSource {
        id
        profile {
          relativeHandle
        }
      }
    }
    ...PostBody_post
  }
`;

export function PostListItem({ post: postKey }: { post: PostListItem_post$key }) {
  const theme = useTheme();
  const post = useFragment(PostListItemFragment, postKey);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const detailHref = `/${post.profile.relativeHandle}/${post.id}` as const;

  if (post.repostSource) {
    if (!post.content && post.replyParent) {
      return null;
    }

    const source = post.repostSource;
    const sourceProfileHref = `/${source.profile.relativeHandle}` as const;
    const sourcePostHref = `/${source.profile.relativeHandle}/${source.id}` as const;
    const nestedSourcePostHref = source.repostSource
      ? (`/${source.repostSource.profile.relativeHandle}/${source.repostSource.id}` as const)
      : null;
    const hrefs = {
      nestedSourcePost: nestedSourcePostHref,
      postAuthor: profileHref,
      postDetail: detailHref,
      sourceAuthor: sourceProfileHref,
      sourcePost: sourcePostHref,
    } satisfies Record<PostPresentationLinkTarget, string | null>;
    const renderLink: PostPresentationLinkRenderer = ({ accessibilityLabel, children, target }) => {
      const href = hrefs[target];
      if (!href) {
        throw new Error('nestedSourcePost target requires a visible direct relation.');
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
    const presentationPost: PostSourcePresentationData = {
      content: post.content
        ? { bodyText: post.content.bodyText, document: post.content.document }
        : null,
      createdAt: post.createdAt,
      id: post.id,
      profile: {
        displayName: post.profile.displayName,
        handle: post.profile.handle,
        relativeHandle: post.profile.relativeHandle,
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
        },
        repostSource: source.repostSource
          ? {
              id: source.repostSource.id,
              profile: { relativeHandle: source.repostSource.profile.relativeHandle },
            }
          : null,
      },
    };

    return (
      <View style={[styles.card, { borderColor: theme.border }]}>
        <View style={styles.sourcePresentation}>
          <PostSourcePresentationView post={presentationPost} renderLink={renderLink} />
        </View>
      </View>
    );
  }

  return (
    <View role="article" style={[styles.card, { borderColor: theme.border }]}>
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
          <Avatar label={post.profile.displayName || post.profile.handle} size={48} />
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
        {post.content?.bodyText ? (
          <Link asChild href={detailHref}>
            <Pressable accessibilityRole="link" style={styles.bodyLink}>
              <PostBody post={post} />
            </Pressable>
          </Link>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  avatar: { borderRadius: radii.full },
  content: { flex: 1, gap: spacing.xs, minWidth: 0 },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  timeLink: { borderRadius: radii.sm, flexShrink: 0 },
  time: { fontFamily: 'SUIT', ...typography.sm },
  bodyLink: { borderRadius: radii.sm, minWidth: 0 },
  presentationLink: { minWidth: 0 },
  sourcePresentation: { flex: 1, minWidth: 0 },
});
