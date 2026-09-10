import { MoreHorizontal, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import { PostActionControl } from './PostActionControl';
import type { View } from 'react-native';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { PostDeletionAction_post$key } from './__generated__/PostDeletionAction_post.graphql';
import type { PostDeletionActionDeletePostMutation } from './__generated__/PostDeletionActionDeletePostMutation.graphql';

const deletePostMutation = graphql`
  mutation PostDeletionActionDeletePostMutation($id: ID!) {
    deletePost(input: { id: $id }) {
      postId @deleteRecord
    }
  }
`;

const postDeletionActionFragment = graphql`
  fragment PostDeletionAction_post on Post {
    id
    state
    content {
      id
    }
    profile {
      id
    }
  }
`;

type Props = {
  items?: readonly ActionMenuItem[];
  pending?: boolean;
  onTriggerReady?: (focus: () => void) => void;
  sheetIconSize?: 20 | 24;
  onDeleted?: () => void;
  post: PostDeletionAction_post$key;
};

const failureMessage = '게시글을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function PostDeletionAction({
  items = [],
  pending = false,
  onTriggerReady,
  sheetIconSize,
  onDeleted,
  post: postKey,
}: Props) {
  const { selectedProfileId } = useSession();
  const environment = useRelayEnvironment();
  const { showToast } = useToast();
  const data = useFragment(postDeletionActionFragment, postKey);
  const [commitDelete, isDeleting] =
    useMutation<PostDeletionActionDeletePostMutation>(deletePostMutation);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const inFlight = useRef(false);
  const currentEnvironment = useRef(environment);
  const mounted = useRef(false);
  const cancelRef = useRef<View>(null);
  const restoreFocusRef = useRef<() => void>(() => undefined);
  const restoreFocusOnDismissRef = useRef(false);

  currentEnvironment.current = environment;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inFlight.current = false;
    };
  }, []);

  useEffect(() => {
    inFlight.current = false;
    restoreFocusOnDismissRef.current = false;
    setRequesting(false);
    setConfirmationOpen(false);
  }, [environment]);

  const closeConfirmation = useCallback(() => {
    if (requesting || isDeleting) {
      return;
    }
    restoreFocusOnDismissRef.current = true;
    setConfirmationOpen(false);
  }, [isDeleting, requesting]);

  const eligible = Boolean(
    selectedProfileId &&
    data.state === 'ACTIVE' &&
    data.content &&
    data.profile.id === selectedProfileId,
  );

  const fail = useCallback(
    (error: Error) => {
      if (!mounted.current || currentEnvironment.current !== environment || !inFlight.current) {
        return;
      }
      inFlight.current = false;
      setRequesting(false);
      showToast(failureMessage, { tone: 'danger' });
      void error;
    },
    [environment, showToast],
  );

  const confirmDelete = useCallback(() => {
    if (inFlight.current || requesting || isDeleting || !confirmationOpen || !eligible) {
      return;
    }

    inFlight.current = true;
    setRequesting(true);
    const requestEnvironment = environment;
    commitDelete({
      onCompleted: (
        response: PostDeletionActionDeletePostMutation['response'],
        errors: ReadonlyArray<{ message: string }> | null | undefined,
      ) => {
        if (errors?.length) {
          fail(new Error(errors[0]?.message ?? failureMessage));
          return;
        }

        const postId = response?.deletePost?.postId;
        if (!postId) {
          fail(new Error(failureMessage));
          return;
        }
        if (
          !mounted.current ||
          currentEnvironment.current !== requestEnvironment ||
          !inFlight.current
        ) {
          return;
        }

        inFlight.current = false;
        restoreFocusOnDismissRef.current = false;
        setRequesting(false);
        setConfirmationOpen(false);
        onDeleted?.();
      },
      onError: fail,
      variables: { id: data.id },
    });
  }, [
    commitDelete,
    confirmationOpen,
    data.id,
    eligible,
    environment,
    fail,
    isDeleting,
    onDeleted,
    requesting,
  ]);

  if (!eligible && items.length === 0) {
    return null;
  }

  const menuItems: readonly ActionMenuItem[] = eligible
    ? [
        ...items,
        {
          accessibilityLabel: '게시글 삭제',
          icon: Trash2,
          key: 'delete-post',
          label: '삭제',
          onSelect: () => setConfirmationOpen(true),
          tone: 'danger',
        },
      ]
    : items;

  return (
    <>
      <ActionMenu
        webMinWidth={160}
        accessibilityLabel="더 보기 메뉴"
        disabled={pending || requesting || isDeleting}
        sheetIconSize={sheetIconSize}
        items={menuItems}
        renderTrigger={({ expanded, focusTrigger, onPress, ref }) => {
          restoreFocusRef.current = focusTrigger;
          onTriggerReady?.(focusTrigger);
          return (
            <PostActionControl
              accessibilityLabel="더 보기"
              alignToEnd
              controlRef={ref}
              icon={MoreHorizontal}
              menuExpanded={expanded}
              onPress={onPress}
              popupRole="menu"
              processing={pending || requesting || isDeleting ? 'pending' : 'default'}
              testID="more"
            />
          );
        }}
        webHorizontalPlacement="end"
      />
      <ModalSheet
        dismissDisabled={requesting || isDeleting}
        onClose={closeConfirmation}
        onShow={() => cancelRef.current?.focus()}
        onDismiss={() => {
          if (restoreFocusOnDismissRef.current) {
            restoreFocusOnDismissRef.current = false;
            restoreFocusRef.current();
          }
        }}
        role="alertdialog"
        title="게시글을 삭제할까요?"
        visible={confirmationOpen}
      >
        <ConfirmationContent
          cancelLabel="취소"
          cancelRef={cancelRef}
          confirmLabel="삭제"
          message="삭제한 게시글은 복구할 수 없습니다."
          onCancel={closeConfirmation}
          onConfirm={confirmDelete}
          pending={requesting || isDeleting}
          tone="danger"
        />
      </ModalSheet>
    </>
  );
}
