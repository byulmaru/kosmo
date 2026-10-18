import { Pin } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { graphql, useMutation, useRefetchableFragment } from 'react-relay';
import { ConnectionHandler } from 'relay-runtime';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import type { ReactNode } from 'react';
import type { View } from 'react-native';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ProfilePinAction_post$key } from './__generated__/ProfilePinAction_post.graphql';
import type { ProfilePinActionPinMutation } from './__generated__/ProfilePinActionPinMutation.graphql';
import type { ProfilePinActionRefetchQuery } from './__generated__/ProfilePinActionRefetchQuery.graphql';
import type { ProfilePinActionUnpinMutation } from './__generated__/ProfilePinActionUnpinMutation.graphql';

const profilePinFragment = graphql`
  fragment ProfilePinAction_post on Post @refetchable(queryName: "ProfilePinActionRefetchQuery") {
    id
    isPinned @catch(to: RESULT)
    state
    visibility
    content {
      id
    }
    profile {
      id
      relativeHandle
      instance {
        kind
      }
    }
  }
`;

const pinMutation = graphql`
  mutation ProfilePinActionPinMutation($postId: ID!) {
    pinProfilePost(input: { postId: $postId }) {
      changed
      profile {
        id
      }
      post {
        id
        isPinned
      }
    }
  }
`;

const unpinMutation = graphql`
  mutation ProfilePinActionUnpinMutation($postId: ID!) {
    unpinProfilePost(input: { postId: $postId }) {
      changed
      profile {
        id
      }
      post {
        id
        isPinned
      }
    }
  }
`;

const pinnedPostsConnectionKey = 'PostList_profile__pinnedPosts';
const failureMessage = '고정 상태를 변경하지 못했어요. 다시 시도해 주세요.';

type Operation = 'pin' | 'unpin';

export function useProfilePinAction(
  postKey: ProfilePinAction_post$key,
  onUnpinned?: () => void,
): Readonly<{
  confirmation: ReactNode;
  item?: ActionMenuItem;
  onMoreTriggerReady: (focus: () => void) => void;
  pending: boolean;
}> {
  const [post, refetch] = useRefetchableFragment<
    ProfilePinActionRefetchQuery,
    ProfilePinAction_post$key
  >(profilePinFragment, postKey);
  const { selectedProfileId } = useSession();
  const { showToast } = useToast();
  const [commitPin, pinPending] = useMutation<ProfilePinActionPinMutation>(pinMutation);
  const [commitUnpin, unpinPending] = useMutation<ProfilePinActionUnpinMutation>(unpinMutation);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [confirmationPhase, setConfirmationPhase] = useState<'open' | 'cancel' | 'confirm'>(
    'cancel',
  );
  const cancelRef = useRef<View>(null);
  const focusTriggerRef = useRef<() => void>(() => undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const pending = pinPending || unpinPending;
  const ownEligible = Boolean(
    selectedProfileId === post.profile.id &&
    post.profile.instance.kind === 'LOCAL' &&
    post.state === 'ACTIVE' &&
    post.content &&
    ['PUBLIC', 'UNLISTED', 'FOLLOWERS'].includes(post.visibility),
  );
  const stateReadFailed = !post.isPinned.ok || post.isPinned.value == null || refreshFailed;
  const pinned = post.isPinned.ok && post.isPinned.value === true;

  const retry = useCallback(() => {
    if (!ownEligible || refreshing) {
      return;
    }
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      refetch(
        {},
        {
          fetchPolicy: 'store-and-network',
          onComplete: (error) => {
            setRefreshing(false);
            setRefreshFailed(Boolean(error));
          },
        },
      );
    } catch {
      setRefreshing(false);
      setRefreshFailed(true);
    }
  }, [ownEligible, refetch, refreshing]);

  const onSelect = useCallback(() => {
    if (!ownEligible || stateReadFailed || pending || selectedOperation) {
      return;
    }
    setSelectedOperation(pinned ? 'unpin' : 'pin');
    setConfirmationPhase('open');
  }, [ownEligible, pending, pinned, selectedOperation, stateReadFailed]);

  const closeConfirmation = useCallback(() => {
    if (confirmationPhase === 'open') {
      setConfirmationPhase('cancel');
    }
  }, [confirmationPhase]);

  const onDismiss = useCallback(() => {
    const operation = selectedOperation;
    setSelectedOperation(null);
    focusTriggerRef.current();
    if (!operation || confirmationPhase !== 'confirm' || pending || !ownEligible) {
      return;
    }

    const relativeHandle = post.profile.relativeHandle;
    const finishFailure = () => {
      showToast(`${relativeHandle}의 ${failureMessage}`, { tone: 'danger' });
    };
    const variables = { postId: post.id };

    if (operation === 'unpin') {
      commitUnpin({
        onCompleted: (response) => {
          const result = response.unpinProfilePost;
          if (typeof result?.changed !== 'boolean' || result.profile?.id !== selectedProfileId) {
            finishFailure();
            return;
          }
          onUnpinned?.();
        },
        onError: finishFailure,
        updater: (store) => {
          const connectionId = ConnectionHandler.getConnectionID(
            post.profile.id,
            pinnedPostsConnectionKey,
          );
          store.get(connectionId)?.invalidateRecord();
        },
        variables,
      });
      return;
    }

    commitPin({
      onCompleted: (response) => {
        const result = response.pinProfilePost;
        if (typeof result?.changed !== 'boolean' || result.profile?.id !== selectedProfileId) {
          finishFailure();
        }
      },
      onError: finishFailure,
      updater: (store) => {
        const connectionId = ConnectionHandler.getConnectionID(
          post.profile.id,
          pinnedPostsConnectionKey,
        );
        store.get(connectionId)?.invalidateRecord();
      },
      variables,
    });
  }, [
    commitPin,
    commitUnpin,
    confirmationPhase,
    onUnpinned,
    ownEligible,
    pending,
    post.id,
    post.profile.id,
    post.profile.relativeHandle,
    selectedOperation,
    selectedProfileId,
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

  if (!ownEligible) {
    return { confirmation, onMoreTriggerReady, pending: false };
  }

  if (stateReadFailed) {
    return {
      item: {
        icon: Pin,
        key: 'retry-profile-pin',
        label: refreshing ? '고정 상태를 불러오는 중' : '고정 상태 다시 불러오기',
        onSelect: retry,
      },
      confirmation,
      onMoreTriggerReady,
      pending: refreshing,
    };
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
