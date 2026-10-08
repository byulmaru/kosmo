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
const replacementFailureMessage =
  '기존 고정은 해제됐지만 새 게시글을 고정하지 못했어요. 다시 시도해 주세요.';
type ProfilePinOperation = 'pin' | 'replace' | 'unpin';
type SelectedProfilePinOperation = Readonly<{
  existingPostId: string | null;
  operation: ProfilePinOperation;
}>;

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
  const [selectedOperation, setSelectedOperation] = useState<SelectedProfilePinOperation | null>(
    null,
  );
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
  const onSelect = useCallback(() => {
    if (!eligible || pending || selectedOperation) {
      return;
    }
    setSelectedOperation({
      existingPostId: pinned ? post.id : firstPinnedPostId,
      operation: pinned ? 'unpin' : firstPinnedPostId ? 'replace' : 'pin',
    });
    setConfirmationPhase('open');
  }, [eligible, firstPinnedPostId, pending, pinned, post.id, selectedOperation]);

  const closeConfirmation = useCallback(() => {
    if (confirmationPhase === 'open') {
      setConfirmationPhase('cancel');
    }
  }, [confirmationPhase]);

  const onDismiss = useCallback(() => {
    const selection = selectedOperation;
    setSelectedOperation(null);
    focusTriggerRef.current();
    if (!selection || confirmationPhase !== 'confirm' || pending || !eligible) {
      return;
    }

    const { existingPostId, operation } = selection;
    const commitTargetPin = (failureToast: string) => {
      commitPin({
        onCompleted: (response) => {
          if (!isDurableProfilePinResult(response.pinProfilePost, post.profile.id)) {
            showToast(failureToast, { tone: 'danger' });
          }
        },
        onError: () => {
          showToast(failureToast, { tone: 'danger' });
        },
        variables: { postId: post.id },
      });
    };
    if (operation === 'unpin') {
      commitUnpin({
        onCompleted: (response) => {
          if (!isDurableProfilePinResult(response.unpinProfilePost, post.profile.id)) {
            showToast(failureMessage, { tone: 'danger' });
            return;
          }
          onUnpinned?.();
        },
        onError: () => {
          showToast(failureMessage, { tone: 'danger' });
        },
        variables: { postId: post.id },
      });
      return;
    }
    if (operation === 'replace') {
      if (!existingPostId) {
        showToast(failureMessage, { tone: 'danger' });
        return;
      }
      commitUnpin({
        onCompleted: (response) => {
          if (!isDurableProfilePinResult(response.unpinProfilePost, post.profile.id)) {
            showToast(failureMessage, { tone: 'danger' });
            return;
          }
          commitTargetPin(replacementFailureMessage);
        },
        onError: () => {
          showToast(failureMessage, { tone: 'danger' });
        },
        variables: { postId: existingPostId },
      });
      return;
    }
    commitTargetPin(failureMessage);
  }, [
    commitPin,
    commitUnpin,
    confirmationPhase,
    eligible,
    pending,
    post.id,
    post.profile.id,
    onUnpinned,
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
      title={
        selectedOperation.operation === 'unpin'
          ? '프로필 고정을 해제할까요?'
          : selectedOperation.operation === 'replace'
            ? '고정 게시글을 바꿀까요?'
            : '프로필에 고정할까요?'
      }
      visible={confirmationPhase === 'open'}
    >
      <ConfirmationContent
        cancelLabel="취소"
        cancelRef={cancelRef}
        confirmLabel={selectedOperation.operation === 'unpin' ? '고정 해제' : '고정'}
        message={
          selectedOperation.operation === 'unpin'
            ? '프로필 상단에서 이 게시글을 제거해요. 게시글은 삭제되지 않아요.'
            : selectedOperation.operation === 'replace'
              ? '기존 고정을 해제하고 이 게시글을 고정해요.'
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

  if (!eligible) {
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
