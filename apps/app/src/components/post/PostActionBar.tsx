import { Bookmark, Heart, MessageCircle, MoreHorizontal } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { spacing } from '@/theme/tokens';
import { PostActionControl } from './PostActionControl';
import { PostDeletionAction } from './PostDeletionAction';
import { usePostBookmarkAction } from './PostBookmarkAction';
import { ReactionAction } from './ReactionAction';
import { RepostAction } from './RepostAction';
import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostActionBar_post$key } from './__generated__/PostActionBar_post.graphql';
import type { PostActionProcessingState } from './PostActionControl';
import type { BookmarkActionConfig, BookmarkActionFailure } from './PostBookmarkAction';
import type { PostReactionController } from './PostReactionController';
import type { RepostActionFailure } from './RepostAction';

type SocialActionConfig = {
  accessibilityLabel: string;
  count?: number;
  onPress: () => void;
  processing: PostActionProcessingState;
};

type ReplyActionConfig = SocialActionConfig & { controlRef?: Ref<View>; expanded: boolean };
type MoreActionConfig = { accessibilityLabel: string; onPress: () => void };

export type PostActionBarProps = {
  bookmark?: BookmarkActionConfig;
  more?: MoreActionConfig;
  onDeleted?: () => void;
  onBookmarkError?: (failure: BookmarkActionFailure) => void;
  onRepostError?: (failure: RepostActionFailure) => void;
  post?: PostActionBar_post$key | null;
  reactionController?: PostReactionController;
  reply?: ReplyActionConfig;
};

const postActionBarPostFragment = graphql`
  fragment PostActionBar_post on Post {
    ...PostBookmarkAction_post @alias(as: "bookmark")
    ...RepostAction_post @alias(as: "repost")
    ...PostDeletionAction_post @alias(as: "deletion")
  }
`;

export function PostActionBar({
  bookmark,
  more,
  onDeleted,
  onBookmarkError,
  onRepostError,
  post,
  reactionController,
  reply,
}: PostActionBarProps) {
  const data = useFragment(postActionBarPostFragment, post ?? null);
  const bookmarkAction = usePostBookmarkAction(data?.bookmark ?? null, onBookmarkError);
  const resolvedBookmark = bookmark ?? bookmarkAction;

  return (
    <View accessibilityLabel="액션 바" accessibilityRole="toolbar" style={styles.root}>
      {reply ? (
        <PostActionControl
          accessibilityLabel={reply.accessibilityLabel}
          count={reply.count}
          controlRef={reply.controlRef}
          expanded={reply.expanded}
          icon={MessageCircle}
          onPress={reply.onPress}
          processing={reply.processing}
          testID="reply"
        />
      ) : null}
      {data?.repost ? <RepostAction onError={onRepostError} post={data.repost} /> : null}
      {reactionController ? (
        <ReactionAction
          controller={reactionController}
          renderTrigger={({ disabled, expanded, hasReacted, onPress, ref }) => (
            <PostActionControl
              accessibilityLabel="반응"
              active={hasReacted}
              controlRef={ref}
              fillActive
              icon={Heart}
              menuExpanded={expanded}
              onPress={onPress}
              popupRole="dialog"
              processing={disabled ? 'disabled' : 'default'}
              testID="reaction"
            />
          )}
        />
      ) : null}
      {resolvedBookmark ? (
        <PostActionControl
          accessibilityLabel={resolvedBookmark.accessibilityLabel}
          active={resolvedBookmark.hasBookmarked}
          fillActive
          icon={Bookmark}
          onPress={resolvedBookmark.onPress}
          processing={resolvedBookmark.processing}
          testID="bookmark"
        />
      ) : null}
      {more ? (
        <PostActionControl
          accessibilityLabel={more.accessibilityLabel}
          alignToEnd
          icon={MoreHorizontal}
          onPress={more.onPress}
          stateful={false}
          testID="more"
        />
      ) : data?.deletion ? (
        <PostDeletionAction onDeleted={onDeleted} post={data.deletion} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    height: 28,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    width: '100%',
  } satisfies StyleProp<ViewStyle>,
});
