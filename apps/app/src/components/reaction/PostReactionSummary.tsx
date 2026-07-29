import { useState } from 'react';
import { View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { usePostReactionController } from '@/components/post/PostReactionController';
import { ReactionProfilesModal } from './ReactionProfilesModal';
import { ReactionSummary } from './ReactionSummary';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostReactionController } from '@/components/post/PostReactionController';
import type { PostReactionSummary_post$key } from './__generated__/PostReactionSummary_post.graphql';

const postReactionSummaryFragment = graphql`
  fragment PostReactionSummary_post on Post {
    ...PostReactionController_post
  }
`;

type PostReactionSummaryControllerProps = {
  controller: PostReactionController;
  style?: StyleProp<ViewStyle>;
};

type PostReactionSummaryLegacyProps = {
  post: PostReactionSummary_post$key;
  style?: StyleProp<ViewStyle>;
};

export function PostReactionSummary(
  props: PostReactionSummaryControllerProps | PostReactionSummaryLegacyProps,
) {
  if ('controller' in props) {
    return <PostReactionSummaryView {...props} />;
  }
  return <LegacyPostReactionSummary {...props} />;
}

function LegacyPostReactionSummary({ post, style }: PostReactionSummaryLegacyProps) {
  const data = useFragment(postReactionSummaryFragment, post);
  const controller = usePostReactionController(data);
  return <PostReactionSummaryView controller={controller} style={style} />;
}

function PostReactionSummaryView({ controller, style }: PostReactionSummaryControllerProps) {
  const [profilesOpen, setProfilesOpen] = useState(false);

  if (controller.reactionCounts.length === 0) {
    return null;
  }

  return (
    <View style={style}>
      <ReactionSummary
        disabled={controller.disabled}
        entries={controller.reactionCounts}
        errorTypeIds={controller.errorTypeIds}
        onMore={() => setProfilesOpen(true)}
        onToggle={controller.toggleReaction}
        pendingTypeIds={controller.pendingTypeIds}
        selectedTypeIds={controller.selectedTypeIds}
      />
      {profilesOpen ? (
        <ReactionProfilesModal
          key={controller.postId}
          onClose={() => setProfilesOpen(false)}
          postId={controller.postId}
          reactionCounts={controller.reactionCounts}
        />
      ) : null}
    </View>
  );
}
