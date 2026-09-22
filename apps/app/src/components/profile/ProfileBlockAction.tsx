import { useRef, useState } from 'react';
import { graphql, useFragment, useMutation } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ProfileBlockAction_profile$key } from './__generated__/ProfileBlockAction_profile.graphql';
import type { ProfileBlockAction_profileBlock$key } from './__generated__/ProfileBlockAction_profileBlock.graphql';
import type { ProfileBlockActionBlockMutation } from './__generated__/ProfileBlockActionBlockMutation.graphql';
import type { ProfileBlockActionUnblockMutation } from './__generated__/ProfileBlockActionUnblockMutation.graphql';

const profileFragment = graphql`
  fragment ProfileBlockAction_profile on Profile {
    id
    displayName
    relativeHandle
  }
`;

const profileBlockFragment = graphql`
  fragment ProfileBlockAction_profileBlock on ProfileBlock {
    id
    targetProfile {
      id
      displayName
      relativeHandle
    }
  }
`;

const blockProfileMutation = graphql`
  mutation ProfileBlockActionBlockMutation($id: ID!) {
    blockProfile(input: { id: $id }) {
      success
      profileBlock {
        id
        ...ProfileBlockAction_profileBlock
        targetProfile {
          ...FollowButton_profile
        }
      }
    }
  }
`;

const unblockProfileMutation = graphql`
  mutation ProfileBlockActionUnblockMutation($id: ID!) {
    unblockProfile(input: { id: $id }) {
      success
      profileBlockId
      targetProfile {
        ...FollowButton_profile
      }
    }
  }
`;

type ProfileBlockMenuItemRenderProps = Readonly<{
  disabled: boolean;
  focusTriggerRef: RefObject<() => void>;
  item: ActionMenuItem;
}>;

type ProfileBlockActionTarget =
  | { nextBlocked: true; profile: ProfileBlockAction_profile$key; profileBlock?: never }
  | {
      nextBlocked: false;
      profile?: never;
      profileBlock: ProfileBlockAction_profileBlock$key;
    };

type Props = ProfileBlockActionTarget &
  (
    | {
        icon: ActionMenuItem['icon'];
        renderMenuItem: (props: ProfileBlockMenuItemRenderProps) => ReactNode;
        surface: 'menu';
      }
    | { icon?: never; renderMenuItem?: never; surface: 'button' }
  );

export function ProfileBlockAction({
  icon,
  nextBlocked,
  profile,
  profileBlock,
  renderMenuItem,
  surface,
}: Props) {
  const profileData = useFragment(profileFragment, profile ?? null);
  const profileBlockData = useFragment(profileBlockFragment, profileBlock ?? null);
  const targetProfile = profileBlockData?.targetProfile ?? profileData;
  const { selectedProfileId } = useSession();
  const [commitBlock, blocking] =
    useMutation<ProfileBlockActionBlockMutation>(blockProfileMutation);
  const [commitUnblock, unblocking] =
    useMutation<ProfileBlockActionUnblockMutation>(unblockProfileMutation);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<View>(null);
  const actionRef = useRef<View>(null);
  const focusTrigger = useRef<() => void>(() => {});
  const completed = useRef<(() => void) | null>(null);
  const pending = blocking || unblocking;

  if (!selectedProfileId || !targetProfile) {
    return null;
  }
  const targetProfileId = targetProfile.id;

  const label = nextBlocked ? '차단' : '차단 해제';
  const close = () => {
    if (!pending) {
      setOpen(false);
    }
  };
  const notify = (status: 'success' | 'error') => {
    showToast(
      status === 'success'
        ? nextBlocked
          ? '프로필을 차단했어요'
          : '차단을 해제했어요'
        : nextBlocked
          ? '프로필을 차단하지 못했어요. 다시 시도해 주세요.'
          : '차단을 해제하지 못했어요. 다시 시도해 주세요.',
      { tone: status === 'success' ? 'success' : 'danger' },
    );
  };
  const request = () => {
    if (pending) {
      return;
    }
    const finish = (status: 'success' | 'error') => {
      completed.current = () => notify(status);
      setOpen(false);
    };
    try {
      if (nextBlocked) {
        commitBlock({
          onCompleted: (response) =>
            finish(
              response.blockProfile?.success && response.blockProfile.profileBlock
                ? 'success'
                : 'error',
            ),
          onError: () => finish('error'),
          variables: { id: targetProfileId },
        });
        return;
      }
      const requestedProfileBlockId = profileBlockData?.id;
      if (!requestedProfileBlockId) {
        finish('error');
        return;
      }
      commitUnblock({
        onCompleted: (response) =>
          finish(
            response.unblockProfile?.success &&
              response.unblockProfile.profileBlockId === requestedProfileBlockId
              ? 'success'
              : 'error',
          ),
        onError: () => finish('error'),
        variables: { id: requestedProfileBlockId },
      });
    } catch {
      finish('error');
    }
  };
  const activate = () => setOpen(true);

  return (
    <>
      {surface === 'menu' ? (
        renderMenuItem!({
          disabled: pending,
          focusTriggerRef: focusTrigger,
          item: { icon: icon!, key: nextBlocked ? 'block' : 'unblock', label, onSelect: activate },
        })
      ) : (
        <Button
          accessibilityLabel={`${targetProfile.displayName} ${
            'relativeHandle' in targetProfile ? targetProfile.relativeHandle : ''
          } ${label}`.replace(/\s+/g, ' ')}
          accessibilityState={{ busy: pending, disabled: pending }}
          controlRef={actionRef}
          disabled={pending}
          onPress={activate}
          style={{ minWidth: 96, width: 96 }}
          tone="secondary"
        >
          {label}
        </Button>
      )}
      <ModalSheet
        dismissDisabled={pending}
        onClose={close}
        onDismiss={() => {
          if (surface === 'menu') {
            focusTrigger.current();
          } else {
            actionRef.current?.focus();
          }
          const notify = completed.current;
          completed.current = null;
          notify?.();
        }}
        onShow={() => cancelRef.current?.focus()}
        title={nextBlocked ? '이 프로필을 차단할까요?' : '이 프로필의 차단을 해제할까요?'}
        visible={open}
      >
        <ConfirmationContent
          cancelLabel="취소"
          cancelRef={cancelRef}
          confirmLabel={label}
          message={
            nextBlocked
              ? '상대방은 내 게시물을 볼 수 없고, 타임라인과 검색에서 서로의 게시물이 숨겨져요. 팔로우 관계와 요청은 삭제돼요.'
              : '차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.'
          }
          onCancel={close}
          onConfirm={request}
          pending={pending}
          tone="danger"
        />
      </ModalSheet>
    </>
  );
}
