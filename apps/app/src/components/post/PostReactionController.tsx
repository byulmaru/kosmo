import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { trackAnalytics } from '@/analytics/client';
import { useSession } from '@/session/SessionProvider';
import {
  createReactionDeleteUpdater,
  createReactionOptimisticUpdater,
} from './PostReactionController.optimistic';
import {
  finishReactionPending,
  getReactionPendingServerSnapshot,
  getReactionPendingSnapshot,
  subscribeReactionPending,
  tryStartReactionPending,
} from './PostReactionController.pending';
import type { ReactionToggleIntent } from '@/components/reaction/ReactionSelector';
import type { PostReactionController_post$key } from './__generated__/PostReactionController_post.graphql';
import type { PostReactionControllerAddReactionMutation } from './__generated__/PostReactionControllerAddReactionMutation.graphql';
import type { PostReactionControllerDeleteReactionMutation } from './__generated__/PostReactionControllerDeleteReactionMutation.graphql';

type ReactionCount = Readonly<{ count: number; type: string }>;

let nextOptimisticOperationId = 0;

export type PostReactionController = Readonly<{
  disabled: boolean;
  errorTypeIds: ReadonlyArray<string>;
  pendingTypeIds: ReadonlyArray<string>;
  postId: string;
  relativeHandle: string;
  reactionCounts: ReadonlyArray<ReactionCount>;
  selectedTypeIds: ReadonlyArray<string>;
  toggleReaction: (intent: ReactionToggleIntent) => void;
}>;

const postReactionControllerFragment = graphql`
  fragment PostReactionController_post on Post {
    id
    profile {
      relativeHandle
    }
    viewerReactions {
      id
      type
    }
    reactionCounts {
      type
      count
    }
  }
`;

const addReactionMutation = graphql`
  mutation PostReactionControllerAddReactionMutation($postId: ID!, $type: String!) {
    addReaction(input: { postId: $postId, type: $type }) {
      reaction {
        id
        type
      }
      post {
        id
        viewerReactions {
          id
          type
        }
        reactionCounts {
          type
          count
        }
      }
    }
  }
`;

const deleteReactionMutation = graphql`
  mutation PostReactionControllerDeleteReactionMutation($postId: ID!, $type: String!) {
    deleteReaction(input: { postId: $postId, type: $type }) {
      reactionId @deleteRecord
      post {
        id
        viewerReactions {
          id
          type
        }
        reactionCounts {
          type
          count
        }
      }
    }
  }
`;

export function usePostReactionController(
  post: PostReactionController_post$key,
  enabled?: boolean,
): PostReactionController {
  const data = useFragment(postReactionControllerFragment, post);
  const environment = useRelayEnvironment();
  const session = useSession();
  const resolvedEnabled =
    enabled ?? (session.status === 'valid' && session.selectedProfileId !== null);
  const [commitAdd] = useMutation<PostReactionControllerAddReactionMutation>(addReactionMutation);
  const [commitDelete] =
    useMutation<PostReactionControllerDeleteReactionMutation>(deleteReactionMutation);
  const [errorTypes, setErrorTypes] = useState<Set<string>>(() => new Set());
  const mounted = useRef(false);
  const postId = data.id;
  const identity = useRef({ environment, epoch: 0, postId });

  if (identity.current.environment !== environment || identity.current.postId !== postId) {
    identity.current = { environment, epoch: identity.current.epoch + 1, postId };
  }

  const isCurrentIdentity = useCallback(
    (requestEnvironment: typeof environment, requestPostId: string, requestEpoch: number) =>
      mounted.current &&
      identity.current.environment === requestEnvironment &&
      identity.current.postId === requestPostId &&
      identity.current.epoch === requestEpoch,
    [],
  );

  const subscribePending = useCallback(
    (listener: () => void) => subscribeReactionPending(environment, postId, listener),
    [environment, postId],
  );
  const getPendingSnapshot = useCallback(
    () => getReactionPendingSnapshot(environment, postId),
    [environment, postId],
  );
  const pendingTypeIds = useSyncExternalStore(
    subscribePending,
    getPendingSnapshot,
    getReactionPendingServerSnapshot,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setErrorTypes(new Set());
  }, [environment, postId]);

  const toggleReaction = useCallback(
    ({ nextSelected, optionId }: ReactionToggleIntent) => {
      if (!resolvedEnabled || !tryStartReactionPending(environment, postId, optionId)) {
        return;
      }

      const requestIdentity = identity.current;
      const optimisticOperationId = ++nextOptimisticOperationId;
      const optimisticReactionId = `client:PostReaction:${postId}:${optimisticOperationId}:Reaction`;
      const optimisticCountId = `client:PostReaction:${postId}:${optimisticOperationId}:ReactionCount`;
      const optimisticUpdater = createReactionOptimisticUpdater({
        nextSelected,
        optimisticCountId,
        optimisticReactionId,
        postId,
        type: optionId,
      });
      setErrorTypes((current) => {
        const next = new Set(current);
        next.delete(optionId);
        return next;
      });

      const finish = (succeeded: boolean) => {
        finishReactionPending(requestIdentity.environment, requestIdentity.postId, optionId);
        if (
          !isCurrentIdentity(
            requestIdentity.environment,
            requestIdentity.postId,
            requestIdentity.epoch,
          )
        ) {
          return;
        }

        if (!succeeded) {
          setErrorTypes((current) => new Set(current).add(optionId));
        }
      };

      const onCompleted = (response: unknown) => {
        const payload = nextSelected
          ? (response as PostReactionControllerAddReactionMutation['response'] | null)?.addReaction
          : (response as PostReactionControllerDeleteReactionMutation['response'] | null)
              ?.deleteReaction;
        const succeeded = Boolean(payload);
        if (succeeded) {
          trackAnalytics(nextSelected ? 'reaction_added' : 'reaction_removed', {
            reaction_type: optionId === '❤️' ? 'default' : 'custom',
          });
        }
        finish(succeeded);
      };

      if (nextSelected) {
        commitAdd({
          onCompleted,
          onError: () => finish(false),
          onUnsubscribe: () =>
            finishReactionPending(requestIdentity.environment, requestIdentity.postId, optionId),
          optimisticUpdater,
          variables: { postId, type: optionId },
        });
      } else {
        commitDelete({
          onCompleted,
          onError: () => finish(false),
          onUnsubscribe: () =>
            finishReactionPending(requestIdentity.environment, requestIdentity.postId, optionId),
          optimisticUpdater,
          updater: createReactionDeleteUpdater({ postId, type: optionId }),
          variables: { postId, type: optionId },
        });
      }
    },
    [commitAdd, commitDelete, environment, isCurrentIdentity, postId, resolvedEnabled],
  );

  return {
    disabled: !resolvedEnabled,
    errorTypeIds: [...errorTypes],
    pendingTypeIds,
    postId,
    relativeHandle: data.profile.relativeHandle,
    reactionCounts: data.reactionCounts,
    selectedTypeIds: data.viewerReactions.map(({ type }) => type),
    toggleReaction,
  };
}
