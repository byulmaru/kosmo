import { MoreHorizontal, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ActionMenuPortal } from '@/components/ui/ActionMenuPortal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, shadow, spacing, typography } from '@/theme/tokens';
import { PostActionControl } from './PostActionControl';
import type { ViewStyle } from 'react-native';
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
    content {
      id
    }
    profile {
      id
    }
  }
`;

type Props = {
  onDeleted?: (postId: string) => void;
  post: PostDeletionAction_post$key;
};

const failureMessage = '게시글을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function PostDeletionAction({ onDeleted, post: postKey }: Props) {
  const theme = useTheme();
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
    setRequesting(false);
    setConfirmationOpen(false);
  }, [environment]);

  useEffect(() => {
    if (!confirmationOpen) {
      return;
    }

    const focusCancel = () => {
      (cancelRef.current as unknown as { focus?: () => void } | null)?.focus?.();
    };
    const timer = setTimeout(focusCancel, 0);
    return () => clearTimeout(timer);
  }, [confirmationOpen]);

  const eligible = Boolean(
    selectedProfileId && data.content && data.profile.id === selectedProfileId,
  );

  const closeConfirmation = useCallback(() => {
    if (!requesting && !isDeleting) {
      setConfirmationOpen(false);
    }
  }, [isDeleting, requesting]);

  const fail = useCallback(
    (error: Error) => {
      if (!mounted.current || currentEnvironment.current !== environment || !inFlight.current) {
        return;
      }
      inFlight.current = false;
      setRequesting(false);
      showToast(failureMessage);
      void error;
    },
    [environment, showToast],
  );

  const confirmDelete = useCallback(() => {
    if (inFlight.current || requesting || isDeleting || !eligible) {
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
        setRequesting(false);
        setConfirmationOpen(false);
        onDeleted?.(postId);
      },
      onError: fail,
      variables: { id: data.id },
    });
  }, [commitDelete, data.id, eligible, environment, fail, isDeleting, onDeleted, requesting]);

  if (!eligible) {
    return null;
  }

  const confirmation = (
    <Pressable accessible={false} onPress={closeConfirmation} style={styles.backdrop}>
      <View
        accessibilityLabel="게시글 삭제 확인"
        accessibilityViewIsModal
        role="alertdialog"
        style={styles.dialogShell}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.dialog, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Text style={[styles.title, { color: theme.text }]}>게시글을 삭제할까요?</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            삭제한 게시글은 복구할 수 없습니다.
          </Text>
          <View style={styles.actions}>
            <Button
              controlRef={cancelRef}
              disabled={requesting || isDeleting}
              onPress={closeConfirmation}
              tone="secondary"
            >
              취소
            </Button>
            <Button
              accessibilityState={{ busy: requesting || isDeleting }}
              disabled={requesting || isDeleting}
              loading={requesting || isDeleting}
              onPress={confirmDelete}
              tone="danger"
            >
              삭제
            </Button>
          </View>
        </Pressable>
      </View>
    </Pressable>
  );

  return (
    <>
      <ActionMenu
        accessibilityLabel="더 보기 메뉴"
        disabled={requesting || isDeleting}
        items={[
          {
            accessibilityLabel: '게시글 삭제',
            icon: Trash2,
            key: 'delete-post',
            label: '삭제',
            onSelect: () => setConfirmationOpen(true),
            tone: 'danger',
          },
        ]}
        renderTrigger={({ expanded, onPress, ref }) => (
          <PostActionControl
            accessibilityLabel="더 보기"
            alignToEnd
            controlRef={ref}
            icon={MoreHorizontal}
            menuExpanded={expanded}
            onPress={onPress}
            popupRole="menu"
            processing={requesting || isDeleting ? 'pending' : 'default'}
            testID="more"
          />
        )}
      />
      {Platform.OS === 'web' ? (
        confirmationOpen ? (
          <ActionMenuPortal>
            <View style={styles.webModal}>{confirmation}</View>
          </ActionMenuPortal>
        ) : null
      ) : (
        <Modal
          animationType="fade"
          onRequestClose={closeConfirmation}
          transparent
          visible={confirmationOpen}
        >
          {confirmation}
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
  },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  description: { fontFamily: 'SUIT', marginTop: spacing.sm, ...typography.sm },
  dialogShell: { maxWidth: 480, pointerEvents: 'box-none', width: '100%' },
  dialog: {
    borderRadius: radii.lg,
    borderWidth: 1,
    maxWidth: 480,
    padding: spacing.lg,
    width: '100%',
    ...shadow,
  } satisfies ViewStyle,
  webModal: { bottom: 0, left: 0, position: 'fixed', right: 0, top: 0, zIndex: 100 },
  title: { fontFamily: 'SUIT', fontWeight: '700', ...typography.lg },
});
