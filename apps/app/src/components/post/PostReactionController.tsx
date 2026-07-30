import { useCallback, useEffect, useRef, useState } from 'react';
import {
  graphql,
  useFragment,
  useMutation,
  useRefetchableFragment,
  useRelayEnvironment,
} from 'react-relay';
import { fetchQuery } from 'relay-runtime';
import { useSession } from '@/session/SessionProvider';
import PostReactionControllerRefetchQueryNode from './__generated__/PostReactionControllerRefetchQuery.graphql';
import type { Disposable, SelectorStoreUpdater } from 'relay-runtime';
import type { ReactionToggleIntent } from '@/components/reaction/ReactionSelector';
import type { PostReactionController_post$key } from './__generated__/PostReactionController_post.graphql';
import type { PostReactionControllerAddReactionMutation } from './__generated__/PostReactionControllerAddReactionMutation.graphql';
import type { PostReactionControllerCounts_post$key } from './__generated__/PostReactionControllerCounts_post.graphql';
import type { PostReactionControllerDeleteReactionMutation } from './__generated__/PostReactionControllerDeleteReactionMutation.graphql';
import type { PostReactionControllerRefetchQuery } from './__generated__/PostReactionControllerRefetchQuery.graphql';

type ReactionCount = Readonly<{ count: number; type: string }>;
type VersionedDelta = Readonly<{ delta: number; version: number }>;

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
    ...PostReactionControllerCounts_post @alias(as: "counts")
  }
`;

const postReactionControllerCountsFragment = graphql`
  fragment PostReactionControllerCounts_post on Post
  @refetchable(queryName: "PostReactionControllerRefetchQuery") {
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
      }
    }
  }
`;

export function applyReactionCountDeltas(
  entries: ReadonlyArray<ReactionCount>,
  deltas: ReadonlyMap<string, number>,
): ReadonlyArray<ReactionCount> {
  const ordered = entries.map((entry) => ({ ...entry }));

  for (const [type, delta] of deltas) {
    const entry = ordered.find((entry) => entry.type === type);
    if (!entry) {
      if (delta > 0) {
        ordered.push({ count: delta, type });
      }
      continue;
    }
    entry.count += delta;
  }

  return ordered.filter(({ count }) => count > 0);
}

export function usePostReactionController(
  post: PostReactionController_post$key,
): PostReactionController {
  const data = useFragment(postReactionControllerFragment, post);
  const [countData] = useRefetchableFragment<
    PostReactionControllerRefetchQuery,
    PostReactionControllerCounts_post$key
  >(postReactionControllerCountsFragment, data.counts);
  const environment = useRelayEnvironment();
  const { selectedProfileId } = useSession();
  const [commitAdd] = useMutation<PostReactionControllerAddReactionMutation>(addReactionMutation);
  const [commitDelete] =
    useMutation<PostReactionControllerDeleteReactionMutation>(deleteReactionMutation);
  const [pendingTypes, setPendingTypes] = useState<Set<string>>(() => new Set());
  const [errorTypes, setErrorTypes] = useState<Set<string>>(() => new Set());
  const [versionedDeltas, setVersionedDeltas] = useState<Map<string, VersionedDelta>>(
    () => new Map(),
  );
  const inFlightTypes = useRef(new Set<string>());
  const mounted = useRef(false);
  const deltaVersion = useRef(0);
  const deltaValues = useRef(new Map<string, VersionedDelta>());
  const refetchDisposable = useRef<Disposable | null>(null);
  const refetchRunning = useRef(false);
  const refetchRunId = useRef(0);
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
      refetchRunId.current += 1;
      refetchDisposable.current?.dispose();
      refetchDisposable.current = null;
      refetchRunning.current = false;
      inFlightTypes.current.clear();
    };
  }, []);

  useEffect(() => {
    inFlightTypes.current.clear();
    deltaValues.current = new Map();
    refetchRunId.current += 1;
    refetchDisposable.current?.dispose();
    refetchDisposable.current = null;
    refetchRunning.current = false;
    setPendingTypes(new Set());
    setErrorTypes(new Set());
    setVersionedDeltas(new Map());
  }, [environment, postId]);

  const runCountRefetch = useCallback(() => {
    if (
      refetchRunning.current ||
      inFlightTypes.current.size > 0 ||
      deltaValues.current.size === 0
    ) {
      return;
    }

    const requestIdentity = identity.current;
    const snapshot = new Map(
      [...deltaValues.current].map(([type, value]) => [type, value.version]),
    );
    const runId = refetchRunId.current + 1;
    refetchRunId.current = runId;
    refetchRunning.current = true;

    let receivedPost = false;
    const finishRefetch = (succeeded: boolean) => {
      if (refetchRunId.current !== runId) {
        return;
      }
      refetchRunning.current = false;
      refetchDisposable.current = null;
      if (
        !isCurrentIdentity(
          requestIdentity.environment,
          requestIdentity.postId,
          requestIdentity.epoch,
        )
      ) {
        return;
      }
      if (succeeded) {
        setVersionedDeltas((current) => {
          const next = new Map(current);
          for (const [type, version] of snapshot) {
            if (next.get(type)?.version === version) {
              next.delete(type);
            }
          }
          deltaValues.current = next;
          return next;
        });
      }
    };
    const subscription = fetchQuery<PostReactionControllerRefetchQuery>(
      requestIdentity.environment,
      PostReactionControllerRefetchQueryNode,
      { id: requestIdentity.postId },
      { fetchPolicy: 'network-only' },
    ).subscribe({
      complete: () => finishRefetch(receivedPost),
      error: () => finishRefetch(false),
      next: (response) => {
        receivedPost = response.node !== null && response.node !== undefined;
      },
    });
    const disposable = { dispose: () => subscription.unsubscribe() };
    if (refetchRunId.current === runId && refetchRunning.current) {
      refetchDisposable.current = disposable;
    } else {
      disposable.dispose();
    }
  }, [isCurrentIdentity]);

  const toggleReaction = useCallback(
    ({ nextSelected, optionId }: ReactionToggleIntent) => {
      if (selectedProfileId === null || inFlightTypes.current.has(optionId)) {
        return;
      }

      if (refetchRunning.current) {
        refetchRunId.current += 1;
        refetchDisposable.current?.dispose();
        refetchDisposable.current = null;
        refetchRunning.current = false;
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
          runCountRefetch();
          return;
        }

        const nextVersion = deltaVersion.current + 1;
        deltaVersion.current = nextVersion;
        const next = new Map(deltaValues.current);
        next.set(optionId, {
          delta: (next.get(optionId)?.delta ?? 0) + (nextSelected ? 1 : -1),
          version: nextVersion,
        });
        deltaValues.current = next;
        setVersionedDeltas(next);
        runCountRefetch();
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
          updater: createAddReactionUpdater(postId),
          variables: { postId, type: optionId },
        });
      } else {
        commitDelete({
          onCompleted,
          onError: () => finish(false),
          updater: createDeleteReactionUpdater(postId, optionId),
          variables: { postId, type: optionId },
        });
      }
    },
    [commitAdd, commitDelete, isCurrentIdentity, postId, runCountRefetch, selectedProfileId],
  );

  const countDeltas = new Map([...versionedDeltas].map(([type, value]) => [type, value.delta]));

  return {
    disabled: selectedProfileId === null,
    errorTypeIds: [...errorTypes],
    pendingTypeIds: [...pendingTypes],
    postId,
    reactionCounts: applyReactionCountDeltas(countData.reactionCounts, countDeltas),
    selectedTypeIds: data.viewerReactions.map(({ type }) => type),
    toggleReaction,
  };
}

export function createAddReactionUpdater(
  postId: string,
): SelectorStoreUpdater<PostReactionControllerAddReactionMutation['response']> {
  return (store) => {
    const payload = store.getRootField('addReaction');
    const reaction = payload?.getLinkedRecord('reaction');
    const post = store.get(postId);
    const current = post?.getLinkedRecords('viewerReactions');
    if (!reaction || !post || !current) {
      return;
    }

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
): SelectorStoreUpdater<PostReactionControllerDeleteReactionMutation['response']> {
  return (store) => {
    const payload = store.getRootField('deleteReaction');
    if (!payload || payload.getLinkedRecord('post')) {
      return;
    }

    const post = store.get(postId);
    const current = post?.getLinkedRecords('viewerReactions');
    if (!post || !current) {
      return;
    }

    post.setLinkedRecords(
      current.filter((item) => item.getValue('type') !== type),
      'viewerReactions',
    );
  };
}
