import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, breakpoints, textStyles } from '@/theme/tokens';

export type ProfileMuteFeedback = { muted: boolean; status: 'success' | 'error' };
export type ProfileMuteControl = {
  muted: boolean;
  onChangeMuted: (muted: boolean) => Promise<void>;
  onFeedback?: (feedback: ProfileMuteFeedback) => void;
};
type Props = ProfileMuteControl & {
  displayName: string;
  profileId: string;
  surface: 'button' | 'text';
  muted: true;
};

export function ProfileMuteAction(props: Props) {
  return <ProfileMuteActionContent key={props.profileId} {...props} />;
}

function ProfileMuteActionContent({
  displayName,
  muted,
  onChangeMuted,
  onFeedback,
  surface,
}: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const mobile = Platform.OS !== 'web' || width < breakpoints.compact;
  const buttonHeight = mobile ? 40 : 32;
  const buttonWidth = mobile ? 88 : 72;
  const actionRef = useRef<View>(null);
  const { activate, pending, confirmation } = useProfileMuteConfirmation({
    displayName,
    muted,
    onChangeMuted,
    onFeedback,
    restoreTriggerFocus: () => actionRef.current?.focus(),
  });
  const label = '뮤트 해제';
  const targetHeight =
    Platform.OS === 'web'
      ? surface === 'text'
        ? 32
        : buttonHeight
      : Platform.OS === 'ios'
        ? 44
        : 48;
  return (
    <>
      {surface === 'text' ? (
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
        <View style={[styles.buttonTarget, { minHeight: targetHeight, width: buttonWidth }]}>
          <Button
            controlRef={actionRef}
            accessibilityLabel={`${displayName} ${label}`}
            aria-busy={pending || undefined}
            hitSlop={
              Platform.OS === 'web'
                ? undefined
                : { top: (targetHeight - 40) / 2, bottom: (targetHeight - 40) / 2 }
            }
            loading={pending}
            onPress={activate}
            size={mobile ? 'default' : 'compact'}
            style={[
              styles.button,
              {
                height: buttonHeight,
                minHeight: buttonHeight,
                minWidth: buttonWidth,
                width: buttonWidth,
              },
            ]}
            tone="secondary"
          >
            {label}
          </Button>
        </View>
      )}
      {confirmation}
    </>
  );
}

// The button and menu wrappers key this lifecycle by the target profile ID.
export function useProfileMuteConfirmation({
  displayName,
  muted,
  onChangeMuted,
  onFeedback,
  restoreTriggerFocus,
}: {
  displayName: string;
  muted: boolean;
  onChangeMuted?: ProfileMuteControl['onChangeMuted'];
  onFeedback?: ProfileMuteControl['onFeedback'];
  restoreTriggerFocus: () => void;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const cancelRef = useRef<View>(null);
  const completed = useRef<ProfileMuteFeedback | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const close = () => {
    if (!inFlight.current) {
      setOpen(false);
    }
  };
  const request = async (nextMuted: boolean) => {
    if (!onChangeMuted || inFlight.current) {
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
    if (!mounted.current) {
      return;
    }
    completed.current = { muted: nextMuted, status: succeeded ? 'success' : 'error' };
    setPending(false);
    setOpen(false);
  };
  const activate = () => {
    setOpen(true);
  };
  const label = muted ? '뮤트 해제' : '뮤트';
  return {
    activate,
    pending,
    confirmation: (
      <ModalSheet
        dismissDisabled={pending}
        onClose={close}
        onDismiss={() => {
          if (!mounted.current) {
            return;
          }
          inFlight.current = false;
          restoreTriggerFocus();
          const feedback = completed.current;
          completed.current = null;
          if (feedback) {
            showToast(
              feedback.status === 'success'
                ? `${displayName} 님이 ${feedback.muted ? '뮤트되었어요' : '뮤트 해제되었어요'}`
                : `${feedback.muted ? '뮤트하지' : '뮤트를 해제하지'} 못했어요. 다시 시도해 주세요.`,
              { tone: feedback.status === 'success' ? 'success' : 'danger' },
            );
            onFeedback?.(feedback);
          }
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
              ? `${displayName} 님의 게시물이 타임라인에 다시 표시되고 새 알림을 받을 수 있어요. 팔로우 관계는 유지돼요.`
              : '홈과 해시태그에서 이 프로필의 게시물이 숨겨지고 새 알림을 받지 않아요. 팔로우 관계는 유지돼요.'
          }
          onCancel={close}
          onConfirm={() => void request(!muted)}
          pending={pending}
        />
      </ModalSheet>
    ),
  };
}

const styles = StyleSheet.create({
  buttonTarget: { alignItems: 'center', justifyContent: 'center' },
  button: { paddingHorizontal: 0 },
  textAction: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
