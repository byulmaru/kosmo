import { Link } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { Avatar } from '@/components/ui/Avatar';
import { formatPostDate } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostActionBar } from './PostActionBar';
import { PostBody } from './PostBody';
import { usePostReactionController } from './PostReactionController';
import { usePostReplyBinding } from './PostReplyCoordinator';
import { PostSourcePreview } from './PostSourcePresentationView';
import { ReplyComposerSurface } from './ReplyComposerSurface';
import { getReplyProcessingState } from './replySurface';
import { useRepostFailureToast } from './useRepostFailureToast';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { SourcePostPresentationData } from './PostSourcePresentationView';

const PostLayoutFragment = graphql`
  fragment PostLayout_post on Post {
    id
    createdAt
    visibility
    content {
      bodyText
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
        displayName
        handle
        relativeHandle
      }
      ...PostActionBar_post @alias(as: "actionBar")
      ...PostReactionController_post @alias(as: "reactionController")
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
  const theme = useTheme();
  const onRepostError = useRepostFailureToast();
  const post = useFragment(PostLayoutFragment, postKey);
  const replyBinding = usePostReplyBinding(post.id);
  const replyTriggerRef = useRef<View>(null);
  const profileHref = `/${post.profile.relativeHandle}` as const;
  const source = post.repostSource;
  const pureRepost = !post.content && !post.replyParent && post.repostSource;
  const actionBarPost = pureRepost ? post.repostSource?.actionBar : post.actionBar;
  const reactionController = usePostReactionController(
    (pureRepost ? post.repostSource?.reactionController : post.reactionController)!,
  );
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
          {presentationSource ? (
            <PostSourcePreview source={presentationSource} style={styles.source} />
          ) : null}
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {formatPostDate(post.createdAt)} ·{' '}
            {visibilityLabels[post.visibility] ?? post.visibility}
          </Text>
          <PostReactionSummary controller={reactionController} style={styles.reactionSummary} />
          <PostActionBar
            onRepostError={onRepostError}
            post={actionBarPost}
            reactionController={reactionController}
            reply={
              replyBinding
                ? {
                    accessibilityLabel: '답글',
                    controlRef: replyTriggerRef,
                    expanded: replyBinding.expanded,
                    onPress: replyBinding.onPress,
                    processing: getReplyProcessingState(true, Boolean(post.content)),
                  }
                : undefined
            }
          />
          {replyBinding && post.content && post.replySurface ? (
            <View style={styles.replySurface}>
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
            </View>
          ) : null}
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
  reactionSummary: { marginTop: spacing.lg },
  source: { marginTop: spacing.sm },
  replySurface: { marginTop: spacing.lg },
});
