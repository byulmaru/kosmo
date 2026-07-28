import { useCallback, useEffect, useRef, useState } from 'react';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { ReactionSelector } from '@/components/reaction/ReactionSelector';
import { useSession } from '@/session/SessionProvider';
import { ReactionPopover } from './ReactionPopover';
import type { ReactNode, Ref } from 'react';
import type { View } from 'react-native';
import type { SelectorStoreUpdater } from 'relay-runtime';
import type { ReactionOption } from '@/components/reaction/ReactionSelector';
import type { ReactionAction_post$key } from './__generated__/ReactionAction_post.graphql';
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

const reactionOptions = ['🥹', '❤️', '🎉', '👀', '☘️', '🌈'].map((type) => ({
  emoji: type,
  id: type,
  label: type,
})) satisfies ReadonlyArray<ReactionOption>;

export type ReactionActionTriggerRenderProps = Readonly<{
  disabled: boolean;
  expanded: boolean;
  hasReacted: boolean;
  onPress: () => void;
  ref: Ref<View>;
}>;

type ReactionActionProps = Readonly<{
  post: ReactionAction_post$key;
  renderTrigger: (props: ReactionActionTriggerRenderProps) => ReactNode;
}>;

export function ReactionAction({ post, renderTrigger }: ReactionActionProps): ReactNode {
  const data = useFragment(reactionActionPostFragment, post);
  const environment = useRelayEnvironment();
  const { selectedProfileId } = useSession();
  const [commitAdd] = useMutation<ReactionActionAddReactionMutation>(addReactionMutation);
  const [commitDelete] = useMutation<ReactionActionDeleteReactionMutation>(deleteReactionMutation);
  const [open, setOpen] = useState(false);
  const [pendingTypes, setPendingTypes] = useState<Set<string>>(() => new Set());
  const [errorTypes, setErrorTypes] = useState<Set<string>>(() => new Set());
  const currentEnvironment = useRef(environment);
  const postId = data.id;
  const disabled = selectedProfileId === null;
  const selectedTypes = (data.viewerReactions ?? []).map(({ type }) => type);

  currentEnvironment.current = environment;

  useEffect(() => {
    setPendingTypes(new Set());
    setErrorTypes(new Set());
    setOpen(false);
  }, [environment, postId]);

  const toggleReaction = useCallback(
    ({ nextSelected, optionId }: { nextSelected: boolean; optionId: string }) => {
      if (disabled || pendingTypes.has(optionId)) {
        return;
      }
      const requestEnvironment = environment;
      const requestPostId = postId;
      setPendingTypes((value) => new Set(value).add(optionId));
      setErrorTypes((value) => {
        const next = new Set(value);
        next.delete(optionId);
        return next;
      });
      const finish = (succeeded: boolean) => {
        if (currentEnvironment.current !== requestEnvironment || postId !== requestPostId) {
          return;
        }
        setPendingTypes((value) => {
          const next = new Set(value);
          next.delete(optionId);
          return next;
        });
        if (!succeeded) {
          setErrorTypes((value) => new Set(value).add(optionId));
        }
      };
      const onCompleted = (response: unknown) => {
        const payload = nextSelected
          ? (response as ReactionActionAddReactionMutation['response']).addReaction
          : (response as ReactionActionDeleteReactionMutation['response']).deleteReaction;
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
    [commitAdd, commitDelete, disabled, environment, pendingTypes, postId],
  );

  return (
    <ReactionPopover
      accessibilityLabel="반응 선택"
      disabled={disabled}
      onOpenChange={setOpen}
      open={open}
      renderTrigger={({ expanded, onPress, ref }) =>
        renderTrigger({ disabled, expanded, hasReacted: selectedTypes.length > 0, onPress, ref })
      }
    >
      <ReactionSelector
        errorOptionIds={[...errorTypes]}
        onToggle={toggleReaction}
        options={reactionOptions}
        pendingOptionIds={[...pendingTypes]}
        selectedOptionIds={selectedTypes}
      />
    </ReactionPopover>
  );
}

export function createAddReactionUpdater(
  postId: string,
): SelectorStoreUpdater<ReactionActionAddReactionMutation['response']> {
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
): SelectorStoreUpdater<ReactionActionDeleteReactionMutation['response']> {
  return (store) => {
    const payload = store.getRootField('deleteReaction');
    if (!payload) {
      return;
    }
    if (payload.getLinkedRecord('post')) {
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
