import { MoreHorizontal, Volume2, VolumeOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { IconButton } from '@/components/ui/IconButton';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, breakpoints, iconSizes, textStyles } from '@/theme/tokens';

export type ProfileMuteFeedback = { muted: boolean; status: 'success' | 'error' };
type Props = {
  displayName: string;
  onChangeMuted: (muted: boolean) => Promise<void>;
  onFeedback?: (feedback: ProfileMuteFeedback) => void;
  profileId: string;
  /** Menu on the profile, button in management, text in the ProfileHero status row. */
} & ({ surface?: 'menu'; muted: boolean } | { surface: 'button' | 'text'; muted: true });

export function ProfileMuteAction(props: Props) {
  // A changed target owns a fresh request lifecycle; old completions cannot update its feedback.
  return <ProfileMuteActionContent key={props.profileId} {...props} />;
}

function ProfileMuteActionContent({
  displayName,
  muted,
  onChangeMuted,
  onFeedback,
  surface = 'menu',
}: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const mobile = Platform.OS !== 'web' || width < breakpoints.compact;
  const buttonHeight = mobile ? 40 : 32;
  const buttonWidth = mobile ? 88 : 72;
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const cancelRef = useRef<View>(null);
  const actionRef = useRef<View>(null);
  const focusTrigger = useRef<() => void>(() => {});
  const restoreFocus = useRef<'cancel' | 'trigger' | null>(null);
  useEffect(() => {
    if (!pending && restoreFocus.current) {
      if (restoreFocus.current === 'cancel') {
        cancelRef.current?.focus();
      } else if (surface === 'menu') {
        focusTrigger.current();
      } else {
        actionRef.current?.focus();
      }
      restoreFocus.current = null;
    }
  }, [pending, surface]);
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
    if (!mounted.current) {
      return;
    }
    inFlight.current = false;
    restoreFocus.current = nextMuted ? (succeeded ? null : 'cancel') : 'trigger';
    setPending(false);
    if (succeeded) {
      setOpen(false);
    }
    showToast(
      succeeded
        ? `${displayName} 님이 ${nextMuted ? '뮤트되었어요' : '뮤트 해제되었어요'}`
        : `${nextMuted ? '뮤트하지' : '뮤트를 해제하지'} 못했어요. 다시 시도해 주세요.`,
      { tone: succeeded ? 'success' : 'danger' },
    );
    onFeedback?.({ muted: nextMuted, status: succeeded ? 'success' : 'error' });
  };
  const activate = () => {
    if (muted) {
      void request(false);
    } else {
      setOpen(true);
    }
  };
  const label = muted ? '뮤트 해제' : '뮤트';
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
      {surface === 'menu' ? (
        <ActionMenu
          accessibilityLabel="프로필 뮤트 메뉴"
          disabled={pending}
          items={[{ icon: muted ? Volume2 : VolumeOff, key: 'mute', label, onSelect: activate }]}
          renderTrigger={({ expanded, focusTrigger: focus, onPress, ref }) => {
            focusTrigger.current = focus;
            return (
              <IconButton
                accessibilityLabel="프로필 뮤트 메뉴"
                accessibilityState={{ expanded, busy: pending }}
                aria-haspopup="menu"
                aria-expanded={expanded}
                controlRef={ref}
                disabled={pending}
                onPress={onPress}
              >
                <MoreHorizontal color={theme.foregroundPrimary} size={iconSizes[20]} />
              </IconButton>
            );
          }}
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
      <ModalSheet
        dismissDisabled={pending}
        onClose={close}
        onDismiss={() => focusTrigger.current()}
        onShow={() => cancelRef.current?.focus()}
        title="이 프로필을 뮤트할까요?"
        visible={open}
      >
        <ConfirmationContent
          cancelLabel="취소"
          cancelRef={cancelRef}
          confirmLabel="뮤트"
          message="홈과 해시태그에서 이 프로필의 게시물이 숨겨지고 새 알림을 받지 않아요. 팔로우 관계는 유지돼요."
          onCancel={close}
          onConfirm={() => void request(true)}
          pending={pending}
        />
      </ModalSheet>
    </>
  );
}
const styles = StyleSheet.create({
  buttonTarget: { alignItems: 'center', justifyContent: 'center' },
  button: { paddingHorizontal: 0 },
  textAction: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
