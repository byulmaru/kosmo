import { useEffect, useRef, useState } from 'react';
import { graphql, useFragment } from 'react-relay';
import { useProfileBlockMutations } from '@/components/profile/ProfileBlockController';
import { StaleProfileBlockRequestError } from '@/components/profile/profileBlockErrors';
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

const profileFragment = graphql`
  fragment ProfileBlockAction_profile on Profile {
    id
    displayName
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

export type ProfileBlockFeedback = { blocked: boolean; status: 'success' | 'error' };

export type ProfileBlockMenuItemRenderProps = Readonly<{
  disabled: boolean;
  focusTriggerRef: RefObject<() => void>;
  item: ActionMenuItem;
}>;

type Target =
  | { nextBlocked: true; profile: ProfileBlockAction_profile$key; profileBlock?: never }
  | {
      nextBlocked: false;
      profile?: never;
      profileBlock: ProfileBlockAction_profileBlock$key;
    };

type Props = Target & {
  onActionRef?: (node: View | null) => void;
  onFeedback?: (feedback: ProfileBlockFeedback) => void;
} & (
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
  onActionRef,
  onFeedback,
  profile,
  profileBlock,
  renderMenuItem,
  surface,
}: Props) {
  const profileData = useFragment(profileFragment, profile ?? null);
  const profileBlockData = useFragment(profileBlockFragment, profileBlock ?? null);
  const targetProfile = profileBlockData?.targetProfile ?? profileData;
  const { selectedProfileId } = useSession();
  const { changeBlocked } = useProfileBlockMutations();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const cancelRef = useRef<View>(null);
  const actionRef = useRef<View>(null);
  const focusTrigger = useRef<() => void>(() => {});

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!selectedProfileId || !targetProfile) {
    return null;
  }

  const label = nextBlocked ? '차단' : '차단 해제';
  const close = () => {
    if (!inFlight.current) {
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
    onFeedback?.({ blocked: nextBlocked, status });
  };
  const request = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    let status: 'success' | 'error' = 'success';
    try {
      await changeBlocked(
        nextBlocked
          ? { ownerProfileId: selectedProfileId, targetProfileId: profileData?.id }
          : { ownerProfileId: selectedProfileId, profileBlockId: profileBlockData?.id },
        nextBlocked,
      );
    } catch (error) {
      if (error instanceof StaleProfileBlockRequestError || !mounted.current) {
        return;
      }
      status = 'error';
    }
    if (!mounted.current) {
      if (status === 'success') {
        notify(status);
      }
      return;
    }
    inFlight.current = false;
    setPending(false);
    setOpen(false);
    notify(status);
  };
  const controlRef = (node: View | null) => {
    actionRef.current = node;
    onActionRef?.(node);
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
          controlRef={controlRef}
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
          onConfirm={() => void request()}
          pending={pending}
          tone="danger"
        />
      </ModalSheet>
    </>
  );
}
