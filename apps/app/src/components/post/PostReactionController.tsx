import { useCallback, useEffect, useRef, useState } from 'react';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { useSession } from '@/session/SessionProvider';
import type { ReactionToggleIntent } from '@/components/reaction/ReactionSelector';
import type { PostReactionController_post$key } from './__generated__/PostReactionController_post.graphql';
import type { PostReactionControllerAddReactionMutation } from './__generated__/PostReactionControllerAddReactionMutation.graphql';
import type { PostReactionControllerDeleteReactionMutation } from './__generated__/PostReactionControllerDeleteReactionMutation.graphql';

type ReactionCount = Readonly<{ count: number; type: string }>;

export type PostReactionController = Readonly<{
  disabled: boolean;
  errorTypeIds: ReadonlyArray<string>;
  pendingTypeIds: ReadonlyArray<string>;
  postId: string;
  reactionCounts: ReadonlyArray<ReactionCount>;
  selectedTypeIds: ReadonlyArray<string>;
  toggleReaction: (intent: ReactionToggleIntent) => void;
}>;

const postReactionControllerFragment = graphql`
  fragment PostReactionController_post on Post {
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
      reactionId
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
  const [pendingTypes, setPendingTypes] = useState<Set<string>>(() => new Set());
  const [errorTypes, setErrorTypes] = useState<Set<string>>(() => new Set());
  const inFlightTypes = useRef(new Set<string>());
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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inFlightTypes.current.clear();
    };
  }, []);

  useEffect(() => {
    inFlightTypes.current.clear();
    setPendingTypes(new Set());
    setErrorTypes(new Set());
  }, [environment, postId]);

  const toggleReaction = useCallback(
    ({ nextSelected, optionId }: ReactionToggleIntent) => {
      if (!resolvedEnabled || inFlightTypes.current.has(optionId)) {
        return;
      }

      const requestIdentity = identity.current;
      inFlightTypes.current.add(optionId);
      setPendingTypes((current) => new Set(current).add(optionId));
      setErrorTypes((current) => {
        const next = new Set(current);
        next.delete(optionId);
        return next;
      });

      const finish = (succeeded: boolean) => {
        if (
          !isCurrentIdentity(
            requestIdentity.environment,
            requestIdentity.postId,
            requestIdentity.epoch,
          )
        ) {
          return;
        }

        inFlightTypes.current.delete(optionId);
        setPendingTypes((current) => {
          const next = new Set(current);
          next.delete(optionId);
          return next;
        });
        if (!succeeded) {
          setErrorTypes((current) => new Set(current).add(optionId));
        }
      };

      const onCompleted = (response: unknown) => {
        const payload = nextSelected
          ? (response as PostReactionControllerAddReactionMutation['response'] | null)?.addReaction
          : (response as PostReactionControllerDeleteReactionMutation['response'] | null)
              ?.deleteReaction;
        finish(Boolean(payload));
      };

      if (nextSelected) {
        commitAdd({
          onCompleted,
          onError: () => finish(false),
          variables: { postId, type: optionId },
        });
      } else {
        commitDelete({
          onCompleted,
          onError: () => finish(false),
          variables: { postId, type: optionId },
        });
      }
    },
    [commitAdd, commitDelete, isCurrentIdentity, postId, resolvedEnabled],
  );

  return {
    disabled: !resolvedEnabled,
    errorTypeIds: [...errorTypes],
    pendingTypeIds: [...pendingTypes],
    postId,
    reactionCounts: data.reactionCounts,
    selectedTypeIds: data.viewerReactions.map(({ type }) => type),
    toggleReaction,
  };
}
