import { Bookmark, Heart, MessageCircle, MoreHorizontal } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { spacing } from '@/theme/tokens';
import { PostActionControl } from './PostActionControl';
import { RepostAction } from './RepostAction';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostActionBar_post$key } from './__generated__/PostActionBar_post.graphql';
import type { PostActionProcessingState } from './PostActionControl';
import type { RepostActionFailure } from './RepostAction';

type SocialActionConfig = {
  accessibilityLabel: string;
  count?: number;
  onPress: () => void;
  processing: PostActionProcessingState;
};

type ReplyActionConfig = SocialActionConfig & { expanded: boolean };
type ReactionActionConfig = Omit<SocialActionConfig, 'count'> & { hasReacted: boolean };
type BookmarkActionConfig = Omit<SocialActionConfig, 'count'> & { hasBookmarked: boolean };
type MoreActionConfig = { accessibilityLabel: string; onPress: () => void };

export type PostActionBarProps = {
  bookmark?: BookmarkActionConfig;
  more?: MoreActionConfig;
  onRepostError?: (failure: RepostActionFailure) => void;
  post?: PostActionBar_post$key | null;
  reaction?: ReactionActionConfig;
  reply?: ReplyActionConfig;
};

const postActionBarPostFragment = graphql`
  fragment PostActionBar_post on Post {
    ...RepostAction_post @alias(as: "repost")
  }
`;

export function PostActionBar({
  bookmark,
  more,
  onRepostError,
  post,
  reaction,
  reply,
}: PostActionBarProps) {
  const data = useFragment(postActionBarPostFragment, post ?? null);

  return (
    <View accessibilityLabel="액션 바" accessibilityRole="toolbar" style={styles.root}>
      {reply ? (
        <PostActionControl
          accessibilityLabel={reply.accessibilityLabel}
          count={reply.count}
          expanded={reply.expanded}
          icon={MessageCircle}
          onPress={reply.onPress}
          processing={reply.processing}
          testID="reply"
        />
      ) : null}
      {data?.repost ? <RepostAction onError={onRepostError} post={data.repost} /> : null}
      {reaction ? (
        <PostActionControl
          accessibilityLabel={reaction.accessibilityLabel}
          active={reaction.hasReacted}
          fillActive
          icon={Heart}
          onPress={reaction.onPress}
          processing={reaction.processing}
          testID="reaction"
        />
      ) : null}
      {bookmark ? (
        <PostActionControl
          accessibilityLabel={bookmark.accessibilityLabel}
          active={bookmark.hasBookmarked}
          fillActive
          icon={Bookmark}
          onPress={bookmark.onPress}
          processing={bookmark.processing}
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
