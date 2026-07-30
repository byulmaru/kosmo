import { View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { PostActionBar } from './PostActionBar';
import { useBookmarkFailureToast } from './PostBookmarkAction';
import { usePostMoreMenuItem } from './PostMoreMenu';
import { usePostReactionController } from './PostReactionController';
import { useRepostFailureToast } from './useRepostFailureToast';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostActionSurface_post$key } from './__generated__/PostActionSurface_post.graphql';
import type { PostActionBarProps } from './PostActionBar';

type Props = Readonly<{
  actionBarStyle?: StyleProp<ViewStyle>;
  onDeleted?: () => void;
  reactionSummaryStyle?: StyleProp<ViewStyle>;
  reply?: PostActionBarProps['reply'];
  socialActionTarget: PostActionSurface_post$key;
}>;

const postActionSurfaceFragment = graphql`
  fragment PostActionSurface_post on Post {
    id
    profile {
      relativeHandle
    }
    ...PostActionBar_post @alias(as: "actionBar")
    ...PostReactionController_post @alias(as: "reactionController")
  }
`;

export function PostActionSurface({
  actionBarStyle,
  onDeleted,
  reactionSummaryStyle,
  reply,
  socialActionTarget,
}: Props) {
  const target = useFragment(postActionSurfaceFragment, socialActionTarget);
  const authentication = usePostActionAuthentication(true);
  const reactionController = usePostReactionController(
    target.reactionController!,
    authentication.execution.kind === 'enabled',
  );
  const onBookmarkError = useBookmarkFailureToast();
  const onRepostError = useRepostFailureToast();
  const copyLinkItem = usePostMoreMenuItem({
    postId: target.id,
    relativeHandle: target.profile.relativeHandle,
  });

  return (
    <>
      <PostReactionSummary controller={reactionController} style={reactionSummaryStyle} />
      <View style={actionBarStyle}>
        <PostActionBar
          execution={authentication.execution}
          moreItems={[copyLinkItem]}
          onBookmarkError={onBookmarkError}
          onDeleted={onDeleted}
          onRepostError={onRepostError}
          onResolutionRequired={authentication.resolve}
          post={target.actionBar}
          reactionController={reactionController}
          reply={reply}
        />
      </View>
    </>
  );
}
