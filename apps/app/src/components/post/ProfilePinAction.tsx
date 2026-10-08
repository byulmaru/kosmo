import { Pin } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { graphql, useFragment, useMutation } from 'react-relay';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import type { ReactNode } from 'react';
import type { View } from 'react-native';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ProfilePinAction_post$key } from './__generated__/ProfilePinAction_post.graphql';
import type { ProfilePinActionPinProfilePostMutation } from './__generated__/ProfilePinActionPinProfilePostMutation.graphql';
import type { ProfilePinActionUnpinProfilePostMutation } from './__generated__/ProfilePinActionUnpinProfilePostMutation.graphql';

const profilePinFragment = graphql`
  fragment ProfilePinAction_post on Post {
    id
    state
    visibility
    content {
      id
    }
    repostSource {
      id
    }
    profile {
      id
      instance {
        kind
      }
      pinnedPosts(first: 20) {
        edges {
          node {
            id
          }
        }
      }
    }
  }
`;

const pinMutation = graphql`
  mutation ProfilePinActionPinProfilePostMutation($postId: ID!) {
    pinProfilePost(input: { postId: $postId }) {
      changed
      profile {
        id
        pinnedPosts(first: 20) @connection(key: "PostList_profile__pinnedPosts") {
          edges {
            node {
              id
              ...PostListItem_post
            }
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
      }
    }
  }
`;

const unpinMutation = graphql`
  mutation ProfilePinActionUnpinProfilePostMutation($postId: ID!) {
    unpinProfilePost(input: { postId: $postId }) {
      changed
      profile {
        id
        pinnedPosts(first: 20) @connection(key: "PostList_profile__pinnedPosts") {
          edges {
            node {
              id
              ...PostListItem_post
            }
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
      }
    }
  }
`;

const failureMessage = '고정 상태를 변경하지 못했어요. 다시 시도해 주세요.';
type ProfilePinOperation = 'pin' | 'unpin';

type ProfilePinMutationPayload =
  | ProfilePinActionPinProfilePostMutation['response']['pinProfilePost']
  | ProfilePinActionUnpinProfilePostMutation['response']['unpinProfilePost'];

function isDurableProfilePinResult(
  result: ProfilePinMutationPayload | null | undefined,
  profileId: string,
) {
  return typeof result?.changed === 'boolean' && result.profile?.id === profileId;
}

export function useProfilePinAction(
  postKey: ProfilePinAction_post$key,
  onUnpinned?: () => void,
): Readonly<{
  confirmation: ReactNode;
  item?: ActionMenuItem;
  onMoreTriggerReady: (focus: () => void) => void;
  pending: boolean;
}> {
  const post = useFragment(profilePinFragment, postKey);
  const { selectedProfileId } = useSession();
  const { showToast } = useToast();
  const [commitPin, isPinning] = useMutation<ProfilePinActionPinProfilePostMutation>(pinMutation);
  const [commitUnpin, isUnpinning] =
    useMutation<ProfilePinActionUnpinProfilePostMutation>(unpinMutation);
  const [selectedOperation, setSelectedOperation] = useState<ProfilePinOperation | null>(null);
  const [confirmationPhase, setConfirmationPhase] = useState<'open' | 'cancel' | 'confirm'>(
    'cancel',
  );
  const cancelRef = useRef<View>(null);
  const focusTriggerRef = useRef<() => void>(() => undefined);
  const pending = isPinning || isUnpinning;

  const firstPinnedPostId =
    post.profile.pinnedPosts.edges.find((edge) => edge.node != null)?.node?.id ?? null;
  const pinned = firstPinnedPostId === post.id;
  const eligible = Boolean(
    selectedProfileId === post.profile.id &&
    post.profile.instance.kind === 'LOCAL' &&
    post.state === 'ACTIVE' &&
    post.content &&
    ['PUBLIC', 'UNLISTED', 'FOLLOWERS'].includes(post.visibility),
  );
  const blockedByExistingPin = Boolean(firstPinnedPostId && !pinned);
  const handleCompleted = useCallback(
    (operation: ProfilePinOperation, result: ProfilePinMutationPayload | null | undefined) => {
      if (!isDurableProfilePinResult(result, post.profile.id)) {
        showToast(failureMessage, { tone: 'danger' });
        return;
      }
      if (operation === 'unpin') {
        onUnpinned?.();
      }
    },
    [onUnpinned, post.profile.id, showToast],
  );

  const onSelect = useCallback(() => {
    if (!eligible || pending || blockedByExistingPin || selectedOperation) {
      return;
    }
    setSelectedOperation(pinned ? 'unpin' : 'pin');
    setConfirmationPhase('open');
  }, [blockedByExistingPin, eligible, pending, pinned, selectedOperation]);

  const closeConfirmation = useCallback(() => {
    if (confirmationPhase === 'open') {
      setConfirmationPhase('cancel');
    }
  }, [confirmationPhase]);

  const onDismiss = useCallback(() => {
    const operation = selectedOperation;
    setSelectedOperation(null);
    focusTriggerRef.current();
    if (
      !operation ||
      confirmationPhase !== 'confirm' ||
      pending ||
      !eligible ||
      blockedByExistingPin
    ) {
      return;
    }

    const onError = () => {
      showToast(failureMessage, { tone: 'danger' });
    };
    if (operation === 'unpin') {
      commitUnpin({
        onCompleted: (response) => {
          handleCompleted(operation, response.unpinProfilePost);
        },
        onError,
        variables: { postId: post.id },
      });
      return;
    }
    commitPin({
      onCompleted: (response) => handleCompleted(operation, response.pinProfilePost),
      onError,
      variables: { postId: post.id },
    });
  }, [
    commitPin,
    commitUnpin,
    confirmationPhase,
    blockedByExistingPin,
    eligible,
    handleCompleted,
    pending,
    post.id,
    selectedOperation,
    showToast,
  ]);

  const onMoreTriggerReady = useCallback((focus: () => void) => {
    focusTriggerRef.current = focus;
  }, []);

  const confirmation = selectedOperation ? (
    <ModalSheet
      onClose={closeConfirmation}
      onDismiss={onDismiss}
      onShow={() => cancelRef.current?.focus()}
      role="alertdialog"
      title={selectedOperation === 'unpin' ? '프로필 고정을 해제할까요?' : '프로필에 고정할까요?'}
      visible={confirmationPhase === 'open'}
    >
      <ConfirmationContent
        cancelLabel="취소"
        cancelRef={cancelRef}
        confirmLabel={selectedOperation === 'unpin' ? '고정 해제' : '고정'}
        message={
          selectedOperation === 'unpin'
            ? '프로필 상단에서 이 게시글을 제거해요. 게시글은 삭제되지 않아요.'
            : '이 게시글을 프로필 상단에 표시해요. 게시글은 삭제되지 않아요.'
        }
        onCancel={closeConfirmation}
        onConfirm={() => {
          if (confirmationPhase === 'open') {
            setConfirmationPhase('confirm');
          }
        }}
      />
    </ModalSheet>
  ) : null;

  if (!eligible || blockedByExistingPin) {
    return { confirmation, onMoreTriggerReady, pending };
  }

  return {
    item: {
      icon: Pin,
      key: pinned ? 'unpin-profile-post' : 'pin-profile-post',
      label: pinned ? '프로필 고정 해제' : '프로필에 고정',
      onSelect,
    },
    confirmation,
    onMoreTriggerReady,
    pending,
  };
}
