import { graphql } from 'react-relay';
import type { SelectorStoreUpdater } from 'relay-runtime';
import type { ReactionActionAddReactionMutation } from './__generated__/ReactionActionAddReactionMutation.graphql';
import type { ReactionActionDeleteReactionMutation } from './__generated__/ReactionActionDeleteReactionMutation.graphql';

const reactionActionPostFragment = graphql`
  fragment ReactionAction_post on Post {
    id
    viewerReactions {
      id
      type
    }
  }
`;

const addReactionMutation = graphql`
  mutation ReactionActionAddReactionMutation($postId: ID!, $type: String!) {
    addReaction(input: { postId: $postId, type: $type }) {
      reaction {
        id
        type
      }
    }
  }
`;

const deleteReactionMutation = graphql`
  mutation ReactionActionDeleteReactionMutation($postId: ID!, $type: String!) {
    deleteReaction(input: { postId: $postId, type: $type }) {
      reactionId
      post {
        id
        viewerReactions {
          id
          type
        }
      }
    }
  }
`;

export function createAddReactionUpdater(
  postId: string,
): SelectorStoreUpdater<ReactionActionAddReactionMutation['response']> {
  return (store) => {
    const payload = store.getRootField('addReaction');
    const reaction = payload?.getLinkedRecord('reaction');
    const post = store.get(postId);
    const current = post?.getLinkedRecords('viewerReactions');
    if (!reaction || !post || !current) return;

    const type = reaction.getValue('type');
    post.setLinkedRecords(
      [
        ...current.filter(
          (item) => item.getDataID() !== reaction.getDataID() && item.getValue('type') !== type,
        ),
        reaction,
      ],
      'viewerReactions',
    );
  };
}

export function createDeleteReactionUpdater(
  postId: string,
  type: string,
): SelectorStoreUpdater<ReactionActionDeleteReactionMutation['response']> {
  return (store) => {
    const payload = store.getRootField('deleteReaction');
    if (!payload) return;
    if (payload.getLinkedRecord('post')) return;

    const post = store.get(postId);
    const current = post?.getLinkedRecords('viewerReactions');
    if (!post || !current) return;

    post.setLinkedRecords(
      current.filter((item) => item.getValue('type') !== type),
      'viewerReactions',
    );
  };
}
