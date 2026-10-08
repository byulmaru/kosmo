import { Pin } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { graphql, useFragment } from 'react-relay';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useSession } from '@/session/SessionProvider';
import { useProfilePin } from './ProfilePinProvider';
import type { ReactNode } from 'react';
import type { View } from 'react-native';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ProfilePinAction_post$key } from './__generated__/ProfilePinAction_post.graphql';

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
    }
  }
`;
type ProfilePinOperation = 'pin' | 'replace' | 'unpin';
type SelectedProfilePinOperation = Readonly<{
  existingPostId: string | null;
  operation: ProfilePinOperation;
}>;

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
  const { available, firstPinnedPostId, pending, request } = useProfilePin();
  const [selectedOperation, setSelectedOperation] = useState<SelectedProfilePinOperation | null>(
    null,
  );
  const [confirmationPhase, setConfirmationPhase] = useState<'open' | 'cancel' | 'confirm'>(
    'cancel',
  );
  const cancelRef = useRef<View>(null);
  const focusTriggerRef = useRef<() => void>(() => undefined);
  const pinned = firstPinnedPostId === post.id;
  const eligible = Boolean(
    available &&
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
    if (operation === 'unpin') {
      request({ kind: 'unpin', onCompleted: onUnpinned, postId: post.id });
      return;
    }
    if (operation === 'replace') {
      if (!existingPostId) {
        return;
      }
      request({ existingPostId, kind: 'replace', postId: post.id });
      return;
    }
    request({ kind: 'pin', postId: post.id });
  }, [confirmationPhase, eligible, pending, post.id, onUnpinned, request, selectedOperation]);

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
    return { confirmation, onMoreTriggerReady, pending: false };
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
