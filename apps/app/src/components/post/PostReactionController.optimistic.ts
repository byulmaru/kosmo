import type { RecordProxy, RecordSourceSelectorProxy } from 'relay-runtime';
import type { PostReactionControllerDeleteReactionMutation } from './__generated__/PostReactionControllerDeleteReactionMutation.graphql';

type ReactionOptimisticUpdaterOptions = Readonly<{
  nextSelected: boolean;
  optimisticCountId: string;
  optimisticReactionId: string;
  postId: string;
  type: string;
}>;

const getReactionType = (record: RecordProxy | null) => record?.getValue('type');

export function createReactionOptimisticUpdater({
  nextSelected,
  optimisticCountId,
  optimisticReactionId,
  postId,
  type,
}: ReactionOptimisticUpdaterOptions) {
  return (store: RecordSourceSelectorProxy) => {
    const post = store.get(postId);
    if (!post) {
      return;
    }

    const viewerReactions = post.getLinkedRecords('viewerReactions') ?? [];
    const hasReaction = viewerReactions.some((reaction) => getReactionType(reaction) === type);

    if (hasReaction === nextSelected) {
      return;
    }

    if (nextSelected) {
      const reaction =
        store.get(optimisticReactionId) ?? store.create(optimisticReactionId, 'Reaction');
      reaction.setValue(optimisticReactionId, 'id');
      reaction.setValue(type, 'type');
      post.setLinkedRecords([...viewerReactions, reaction], 'viewerReactions');
    } else {
      post.setLinkedRecords(
        viewerReactions.filter((reaction) => getReactionType(reaction) !== type),
        'viewerReactions',
      );
    }

    const reactionCounts = post.getLinkedRecords('reactionCounts') ?? [];
    const count = reactionCounts.find((reactionCount) => getReactionType(reactionCount) === type);

    if (count) {
      const currentCount = count.getValue('count');
      if (typeof currentCount !== 'number') {
        return;
      }

      const nextCount = currentCount + (nextSelected ? 1 : -1);
      if (nextCount > 0) {
        count.setValue(nextCount, 'count');
        return;
      }

      post.setLinkedRecords(
        reactionCounts.filter((reactionCount) => reactionCount !== count),
        'reactionCounts',
      );
      store.delete(count.getDataID());
      return;
    }

    if (nextSelected) {
      const optimisticCount =
        store.get(optimisticCountId) ?? store.create(optimisticCountId, 'ReactionCount');
      optimisticCount.setValue(type, 'type');
      optimisticCount.setValue(1, 'count');
      post.setLinkedRecords([...reactionCounts, optimisticCount], 'reactionCounts');
    }
  };
}

export function createReactionDeleteUpdater({
  postId,
  type,
}: Readonly<{ postId: string; type: string }>) {
  return (
    store: RecordSourceSelectorProxy<PostReactionControllerDeleteReactionMutation['response']>,
    data: PostReactionControllerDeleteReactionMutation['response'] | null | undefined,
  ) => {
    const deleteReaction = data?.deleteReaction;
    if (deleteReaction?.post !== null || typeof deleteReaction.reactionId !== 'string') {
      return;
    }

    const post = store.get(postId);
    if (!post) {
      return;
    }

    const viewerReactions = (post.getLinkedRecords('viewerReactions') ??
      []) as Array<RecordProxy | null>;
    const nextViewerReactions = viewerReactions.filter((reaction) => {
      if (!reaction) {
        return false;
      }

      return (
        reaction.getValue('type') !== type &&
        reaction.getDataID() !== deleteReaction.reactionId &&
        reaction.getValue('id') !== deleteReaction.reactionId
      );
    });

    if (nextViewerReactions.length !== viewerReactions.length) {
      post.setLinkedRecords(nextViewerReactions, 'viewerReactions');
    }
  };
}
