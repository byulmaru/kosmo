import { useState } from 'react';
import { View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ReactionProfilesModal } from './ReactionProfilesModal';
import { ReactionSummary } from './ReactionSummary';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostReactionSummary_post$key } from './__generated__/PostReactionSummary_post.graphql';

const postReactionSummaryFragment = graphql`
  fragment PostReactionSummary_post on Post {
    id
    reactionCounts {
      type
      count
    }
  }
`;

export function PostReactionSummary({
  post: postKey,
  style,
}: {
  post: PostReactionSummary_post$key;
  style?: StyleProp<ViewStyle>;
}) {
  const post = useFragment(postReactionSummaryFragment, postKey);
  const [selectedType, setSelectedType] = useState<string>();

  if (post.reactionCounts.length === 0) {
    return null;
  }

  return (
    <View style={style}>
      <ReactionSummary entries={post.reactionCounts} onSelectType={setSelectedType} />
      {selectedType ? (
        <ReactionProfilesModal
          key={`${post.id}:${selectedType}`}
          onClose={() => setSelectedType(undefined)}
          postId={post.id}
          reactionType={selectedType}
        />
      ) : null}
    </View>
  );
}
