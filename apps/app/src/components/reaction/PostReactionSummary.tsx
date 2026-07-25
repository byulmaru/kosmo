import { useState } from 'react';
import { graphql, useFragment } from 'react-relay';
import { ReactionProfilesModal } from './ReactionProfilesModal';
import { ReactionSummary } from './ReactionSummary';
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

export function PostReactionSummary({ post: postKey }: { post: PostReactionSummary_post$key }) {
  const post = useFragment(postReactionSummaryFragment, postKey);
  const [selectedType, setSelectedType] = useState<string>();

  if (post.reactionCounts.length === 0) {
    return null;
  }

  return (
    <>
      <ReactionSummary entries={post.reactionCounts} onSelectType={setSelectedType} />
      {selectedType ? (
        <ReactionProfilesModal
          key={`${post.id}:${selectedType}`}
          onClose={() => setSelectedType(undefined)}
          postId={post.id}
          reactionType={selectedType}
        />
      ) : null}
    </>
  );
}
