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
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { PostActionBar_post$key } from './__generated__/PostActionBar_post.graphql';
import type { PostActionExecution, PostActionResolutionReason } from './postActionAvailability';
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
export type MoreActionConfig = {
  accessibilityLabel: string;
  controlRef?: Ref<View>;
  menuExpanded?: boolean;
  onPress: () => void;
  popupRole?: 'menu';
};

export type PostActionBarProps = {
  bookmark?: BookmarkActionConfig;
  execution?: PostActionExecution;
  more?: MoreActionConfig;
  moreItems?: readonly ActionMenuItem[];
  onDeleted?: () => void;
  onBookmarkError?: (failure: BookmarkActionFailure) => void;
  onRepostError?: (failure: RepostActionFailure) => void;
  onResolutionRequired?: (reason: PostActionResolutionReason) => void;
  post?: PostActionBar_post$key | null;
  reactionController?: PostReactionController;
  reply?: ReplyActionConfig;
  repostExecution?: PostActionExecution;
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
  execution = { kind: 'enabled' },
  more,
  moreItems,
  onDeleted,
  onBookmarkError,
  onRepostError,
  onResolutionRequired,
  post,
  reactionController,
  reply,
  repostExecution = execution,
}: PostActionBarProps) {
  const data = useFragment(postActionBarPostFragment, post ?? null);
  const bookmarkAction = usePostBookmarkAction(
    data?.bookmark ?? null,
    execution,
    onResolutionRequired,
    onBookmarkError,
  );
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
      {data?.repost ? (
        <RepostAction
          execution={repostExecution}
          onError={onRepostError}
          onResolutionRequired={onResolutionRequired}
          post={data.repost}
        />
      ) : null}
      {reactionController ? (
        <ReactionAction
          controller={reactionController}
          execution={execution}
          onResolutionRequired={onResolutionRequired}
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
          controlRef={more.controlRef}
          icon={MoreHorizontal}
          menuExpanded={more.menuExpanded}
          onPress={more.onPress}
          popupRole={more.popupRole}
          stateful={Boolean(more.popupRole)}
          testID="more"
        />
      ) : data?.deletion ? (
        <PostDeletionAction items={moreItems} onDeleted={onDeleted} post={data.deletion} />
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
