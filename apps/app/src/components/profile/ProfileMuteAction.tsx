import { Volume2, VolumeOff } from 'lucide-react-native';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { useProfileMuteMutations } from '@/components/profile/ProfileMuteController';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, breakpoints, textStyles } from '@/theme/tokens';
import { ProfileMoreMenu } from './ProfileMoreMenu';
import type { ComponentProps } from 'react';
import type { View } from 'react-native';
import type { ActionMenu, ActionMenuItem } from '@/components/ui/ActionMenu';
import type { ProfileMuteAction_profile$key } from './__generated__/ProfileMuteAction_profile.graphql';

export type ProfileMuteFeedback = { muted: boolean; status: 'success' | 'error' };
export type ProfileMuteControl = {
  muted: boolean;
  onChangeMuted: (muted: boolean) => Promise<void>;
  onFeedback?: (feedback: ProfileMuteFeedback) => void;
};

const profileMuteActionFragment = graphql`
  fragment ProfileMuteAction_profile on Profile {
    id
    displayName
    viewerState {
      profileMute {
        id
      }
    }
  }
`;

type ProfileMuteActionProps = {
  onFeedback?: (feedback: ProfileMuteFeedback) => void;
  profile: ProfileMuteAction_profile$key;
} & (
  | {
      items?: readonly ActionMenuItem[];
      renderTrigger?: ComponentProps<typeof ActionMenu>['renderTrigger'];
      surface?: 'menu';
    }
  | { items?: never; renderTrigger?: never; surface: 'button' | 'text' }
);

export function ProfileMuteAction({
  items,
  onFeedback,
  profile,
  renderTrigger,
  surface = 'menu',
}: ProfileMuteActionProps) {
  const data = useFragment(profileMuteActionFragment, profile);
  const { selectedProfileId } = useSession();
  const { changeMuted } = useProfileMuteMutations();
  const profileMuteId = data.viewerState?.profileMute?.id;
  const muted = Boolean(profileMuteId);

  if (!selectedProfileId || (surface !== 'menu' && !muted)) {
    return null;
  }

  const onChangeMuted = (nextMuted: boolean) =>
    changeMuted(
      {
        ownerProfileId: selectedProfileId,
        profileMuteId,
        targetProfileId: data.id,
      },
      nextMuted,
    );

  if (surface !== 'menu') {
    return (
      <ProfileMuteActionControl
        displayName={data.displayName}
        muted
        onChangeMuted={onChangeMuted}
        onFeedback={onFeedback}
        profileId={data.id}
        surface={surface}
      />
    );
  }

  return (
    <ProfileMuteActionControl
      displayName={data.displayName}
      items={items}
      muted={muted}
      onChangeMuted={onChangeMuted}
      onFeedback={onFeedback}
      profileId={data.id}
      renderTrigger={renderTrigger}
    />
  );
}
type Props = {
  displayName: string;
  onChangeMuted: (muted: boolean) => Promise<void>;
  onFeedback?: (feedback: ProfileMuteFeedback) => void;
  profileId: string;
  /** Menu on the profile, button in management, text in the ProfileHero status row. */
} & (
  | {
      surface?: 'menu';
      muted: boolean;
      items?: readonly ActionMenuItem[];
      renderTrigger?: ComponentProps<typeof ActionMenu>['renderTrigger'];
    }
  | { surface: 'button' | 'text'; muted: true; items?: never; renderTrigger?: never }
);

type CommittedProfileTarget = Readonly<{
  profileId: string;
  revision: number;
}>;

type CommittedProfileTargetRef = {
  current: CommittedProfileTarget;
};

export function ProfileMuteActionControl(props: Props) {
  const committedTargetRef = useRef<CommittedProfileTarget>({
    profileId: props.profileId,
    revision: 0,
  });

  // A changed target owns a fresh request lifecycle; old completions cannot update its feedback.
  return (
    <ProfileMuteActionContent
      key={props.profileId}
      {...props}
      committedTargetRef={committedTargetRef}
    />
  );
}

function ProfileMuteActionContent({
  displayName,
  committedTargetRef,
  muted,
  onChangeMuted,
  onFeedback,
  profileId,
  surface = 'menu',
  items = [],
  renderTrigger,
}: Props & { committedTargetRef: CommittedProfileTargetRef }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const mobile = Platform.OS !== 'web' || width < breakpoints.compact;
  const buttonWidth = mobile ? 88 : 72;
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const claimedRevisionRef = useRef<number | null>(null);
  const cancelRef = useRef<View>(null);
  const actionRef = useRef<View>(null);
  const focusTrigger = useRef<() => void>(() => {});
  const completed = useRef<(() => void) | null>(null);
  const restoreTriggerFocus = () => {
    if (surface === 'menu') {
      focusTrigger.current();
    } else {
      actionRef.current?.focus();
    }
  };
  useLayoutEffect(() => {
    const committedTarget = committedTargetRef.current;
    if (committedTarget.profileId !== profileId) {
      committedTargetRef.current = {
        profileId,
        revision: committedTarget.revision + 1,
      };
    }
    claimedRevisionRef.current = committedTargetRef.current.revision;
  }, [committedTargetRef, profileId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const notify = completed.current;
      completed.current = null;
      if (
        committedTargetRef.current.profileId === profileId &&
        committedTargetRef.current.revision === claimedRevisionRef.current
      ) {
        notify?.();
      }
    };
  }, [committedTargetRef, profileId]);
  const close = () => {
    if (!inFlight.current) {
      setOpen(false);
    }
  };
  const request = async (nextMuted: boolean) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    let succeeded = false;
    try {
      await onChangeMuted(nextMuted);
      succeeded = true;
    } catch {
      // The public boundary presents a safe message, never a backend error string.
    }
    if (
      claimedRevisionRef.current === null ||
      committedTargetRef.current.profileId !== profileId ||
      committedTargetRef.current.revision !== claimedRevisionRef.current
    ) {
      return;
    }
    if (!mounted.current && !succeeded) {
      return;
    }
    if (!mounted.current) {
      showToast(`${displayName} 님이 ${nextMuted ? '뮤트되었어요' : '뮤트 해제되었어요'}`, {
        tone: 'success',
      });
      onFeedback?.({ muted: nextMuted, status: 'success' });
      return;
    }
    setPending(false);
    completed.current = () => {
      const status = succeeded ? 'success' : 'error';
      showToast(
        succeeded
          ? `${displayName} 님이 ${nextMuted ? '뮤트되었어요' : '뮤트 해제되었어요'}`
          : `${nextMuted ? '뮤트하지' : '뮤트를 해제하지'} 못했어요. 다시 시도해 주세요.`,
        { tone: status === 'success' ? 'success' : 'danger' },
      );
      onFeedback?.({ muted: nextMuted, status });
    };
    setOpen(false);
  };
  const activate = () => {
    setOpen(true);
  };
  const label = muted ? '뮤트 해제' : '뮤트';
  const targetHeight = Platform.OS === 'web' ? 32 : Platform.OS === 'ios' ? 44 : 48;
  return (
    <>
      {surface === 'menu' ? (
        <ProfileMoreMenu
          disabled={pending}
          items={[
            ...items,
            { icon: muted ? Volume2 : VolumeOff, key: 'mute', label, onSelect: activate },
          ]}
          focusTriggerRef={focusTrigger}
          renderTrigger={renderTrigger}
        />
      ) : surface === 'text' ? (
        <Pressable
          ref={actionRef}
          accessibilityLabel={label}
          accessibilityRole="button"
          accessibilityState={{ busy: pending, disabled: pending }}
          disabled={pending}
          onPress={activate}
          hitSlop={
            Platform.OS === 'web'
              ? undefined
              : { top: (targetHeight - 32) / 2, bottom: (targetHeight - 32) / 2 }
          }
          style={(state) => [
            styles.textAction,
            { minHeight: 32 },
            Platform.OS === 'web' && (state as { focused?: boolean }).focused
              ? {
                  outlineColor: theme.stateFocusRing,
                  outlineStyle: 'solid',
                  outlineWidth: borderWidths[2],
                }
              : undefined,
          ]}
        >
          {({ pressed, ...state }) => (
            <Text
              style={[
                textStyles.uiLabelM,
                {
                  color: pressed
                    ? theme.actionLinkPressed
                    : (state as { hovered?: boolean }).hovered
                      ? theme.actionLinkHover
                      : theme.actionLinkBase,
                },
              ]}
            >
              {label}
            </Text>
          )}
        </Pressable>
      ) : (
        <Button
          controlRef={actionRef}
          accessibilityLabel={`${displayName} ${label}`}
          aria-busy={pending || undefined}
          loading={pending}
          onPress={activate}
          size={mobile ? 'default' : 'compact'}
          style={{ minWidth: buttonWidth, width: buttonWidth, paddingHorizontal: 0 }}
          tone="secondary"
        >
          {label}
        </Button>
      )}
      <ModalSheet
        dismissDisabled={pending}
        onClose={close}
        onDismiss={() => {
          if (!mounted.current) {
            return;
          }
          inFlight.current = false;
          restoreTriggerFocus();
          const notify = completed.current;
          completed.current = null;
          notify?.();
        }}
        onShow={() => cancelRef.current?.focus()}
        title={muted ? '이 프로필을 뮤트 해제할까요?' : '이 프로필을 뮤트할까요?'}
        visible={open}
      >
        <ConfirmationContent
          cancelLabel="취소"
          cancelRef={cancelRef}
          confirmLabel={label}
          message={
            muted
              ? `${displayName} 님의 게시물이 홈과 로컬 타임라인에 다시 표시돼요. 팔로우 관계는 유지돼요.`
              : '홈과 로컬 타임라인에서 이 프로필의 게시물이 숨겨지고 팔로우 관계는 유지돼요.'
          }
          onCancel={close}
          onConfirm={() => void request(!muted)}
          pending={pending}
        />
      </ModalSheet>
    </>
  );
}
const styles = StyleSheet.create({
  textAction: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
