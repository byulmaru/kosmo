import { Pin } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { graphql, useFragment, useMutation } from 'react-relay';
import { trackAnalytics } from '@/analytics/client';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { useSession } from '@/session/SessionProvider';
import type { ReactNode } from 'react';
import type { View } from 'react-native';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ProfilePinAction_post$key } from './__generated__/ProfilePinAction_post.graphql';
import type { ProfilePinActionPinMutation } from './__generated__/ProfilePinActionPinMutation.graphql';
import type { ProfilePinActionUnpinMutation } from './__generated__/ProfilePinActionUnpinMutation.graphql';

const profilePinFragment = graphql`
  fragment ProfilePinAction_post on Post {
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
        ...PostList_profile_pinned
      }
      post {
        ...ProfilePinAction_post
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
        ...PostList_profile_pinned
      }
      post {
        ...ProfilePinAction_post
      }
    }
  }
`;

const failureMessage = '고정 상태를 변경하지 못했어요. 다시 시도해 주세요.';

type Operation = 'pin' | 'unpin';

export function useProfilePinAction(postKey: ProfilePinAction_post$key): Readonly<{
  confirmation: ReactNode;
  item?: ActionMenuItem;
  onMoreTriggerReady: (focus: () => void) => void;
  pending: boolean;
}> {
  const post = useFragment(profilePinFragment, postKey);
  const { selectedProfileId } = useSession();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const { showToast } = useToast();
  const [commitPin, pinPending] = useMutation<ProfilePinActionPinMutation>(pinMutation);
  const [commitUnpin, unpinPending] = useMutation<ProfilePinActionUnpinMutation>(unpinMutation);
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [confirmationPhase, setConfirmationPhase] = useState<'open' | 'cancel' | 'confirm'>(
    'cancel',
  );
  const cancelRef = useRef<View>(null);
  const focusTriggerRef = useRef<() => void>(() => undefined);
  const pending = pinPending || unpinPending;
  const ownEligible = Boolean(
    selectedProfileId === post.profile.id &&
    post.profile.instance.kind === 'LOCAL' &&
    post.state === 'ACTIVE' &&
    post.content &&
    ['PUBLIC', 'UNLISTED', 'FOLLOWERS'].includes(post.visibility),
  );
  const stateReadFailed = !post.isPinned.ok || post.isPinned.value == null;
  const pinned = post.isPinned.ok && post.isPinned.value === true;

  const submit = useCallback(
    (operation: Operation) => {
      const finishFailure = () => {
        showToast(`${post.profile.relativeHandle}의 ${failureMessage}`, { tone: 'danger' });
      };
      const requestGeneration = environmentGenerationRef?.current;
      const variables = { postId: post.id };

      if (operation === 'unpin') {
        commitUnpin({
          onCompleted: (response, errors) => {
            const result = response.unpinProfilePost;
            if (typeof result?.changed !== 'boolean' || result.profile?.id !== selectedProfileId) {
              finishFailure();
              return;
            }
            if (
              !errors?.length &&
              result.changed &&
              environmentGenerationRef?.current === requestGeneration
            ) {
              trackAnalytics('post_unpinned', {});
            }
          },
          onError: finishFailure,
          variables,
        });
        return;
      }

      commitPin({
        onCompleted: (response, errors) => {
          const result = response.pinProfilePost;
          if (typeof result?.changed !== 'boolean' || result.profile?.id !== selectedProfileId) {
            finishFailure();
            return;
          }
          if (
            !errors?.length &&
            result.changed &&
            environmentGenerationRef?.current === requestGeneration
          ) {
            trackAnalytics('post_pinned', {});
          }
        },
        onError: finishFailure,
        variables,
      });
    },
    [
      commitPin,
      commitUnpin,
      environmentGenerationRef,
      post.id,
      post.profile.relativeHandle,
      selectedProfileId,
      showToast,
    ],
  );

  const onSelect = useCallback(() => {
    if (!ownEligible || stateReadFailed || pending || selectedOperation) {
      return;
    }
    if (pinned) {
      setSelectedOperation('unpin');
      setConfirmationPhase('open');
      return;
    }
    submit('pin');
  }, [ownEligible, pending, pinned, selectedOperation, stateReadFailed, submit]);

  const closeConfirmation = useCallback(() => {
    if (confirmationPhase === 'open') {
      setConfirmationPhase('cancel');
    }
  }, [confirmationPhase]);

  const onDismiss = useCallback(() => {
    const operation = selectedOperation;
    setSelectedOperation(null);
    focusTriggerRef.current();
    if (operation !== 'unpin' || confirmationPhase !== 'confirm' || pending || !ownEligible) {
      return;
    }
    submit(operation);
  }, [confirmationPhase, ownEligible, pending, selectedOperation, submit]);

  const onMoreTriggerReady = useCallback((focus: () => void) => {
    focusTriggerRef.current = focus;
  }, []);

  const confirmation = selectedOperation ? (
    <ModalSheet
      onClose={closeConfirmation}
      onDismiss={onDismiss}
      onShow={() => cancelRef.current?.focus()}
      role="alertdialog"
      title="프로필 고정을 해제할까요?"
      visible={confirmationPhase === 'open'}
    >
      <ConfirmationContent
        cancelLabel="취소"
        cancelRef={cancelRef}
        confirmLabel="고정 해제"
        onCancel={closeConfirmation}
        onConfirm={() => {
          if (confirmationPhase === 'open') {
            setConfirmationPhase('confirm');
          }
        }}
      />
    </ModalSheet>
  ) : null;

  if (!ownEligible || stateReadFailed) {
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
