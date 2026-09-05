import { Ban, MoreHorizontal, ShieldOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { IconButton } from '@/components/ui/IconButton';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, iconSizes } from '@/theme/tokens';
import type { Ref } from 'react';

export type ProfileBlockFeedback = { blocked: boolean; status: 'success' | 'error' };
type Props = {
  displayName: string;
  onChangeBlocked: (blocked: boolean) => Promise<void>;
  /** Observe the result and apply the confirmed state; failed requests keep their previous state. */
  onFeedback?: (feedback: ProfileBlockFeedback) => void;
  onDismiss?: () => void;
  profileId: string;
} & (
  | { surface?: 'menu'; blocked: boolean; controlRef?: never }
  | { surface: 'button'; blocked: true; controlRef?: Ref<View> }
);

export function ProfileBlockAction(props: Props) {
  // A new target owns a fresh lifecycle; an old request cannot publish its feedback here.
  return <ProfileBlockActionContent key={props.profileId} {...props} />;
}

function ProfileBlockActionContent({
  blocked,
  controlRef,
  displayName,
  onChangeBlocked,
  onDismiss,
  onFeedback,
  surface = 'menu',
}: Props) {
  const theme = useTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const mobile = Platform.OS !== 'web' || width < breakpoints.compact;
  const buttonHeight = mobile ? 40 : 32;
  const buttonWidth = mobile ? 88 : 72;
  const targetHeight = Platform.OS === 'web' ? buttonHeight : Platform.OS === 'ios' ? 44 : 48;
  const [open, setOpen] = useState(false);
  const [nextBlocked, setNextBlocked] = useState(!blocked);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const cancelRef = useRef<View>(null);
  const actionRef = useRef<View>(null);
  const focusMenuTrigger = useRef<() => void>(() => {});
  const restoreCancelFocus = useRef(false);
  useEffect(() => {
    if (!pending && restoreCancelFocus.current) {
      restoreCancelFocus.current = false;
      cancelRef.current?.focus();
    }
  }, [pending]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const close = () => {
    if (open && !inFlight.current) {
      setOpen(false);
      onDismiss?.();
    }
  };
  const request = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    let succeeded = false;
    try {
      await onChangeBlocked(nextBlocked);
      succeeded = true;
    } catch {
      // Never expose a backend error string at the presentation boundary.
    }
    if (!mounted.current) {
      return;
    }
    inFlight.current = false;
    restoreCancelFocus.current = !succeeded;
    setPending(false);
    if (succeeded) {
      setOpen(false);
    }
    showToast(
      succeeded
        ? `${displayName} 님이 ${nextBlocked ? '차단되었어요' : '차단 해제되었어요'}`
        : `${nextBlocked ? '차단하지' : '차단을 해제하지'} 못했어요. 다시 시도해 주세요.`,
      { tone: succeeded ? 'success' : 'danger' },
    );
    onFeedback?.({ blocked: nextBlocked, status: succeeded ? 'success' : 'error' });
  };
  const activate = () => {
    setNextBlocked(!blocked);
    setOpen(true);
  };
  const label = blocked ? '차단 해제' : '차단';
  return (
    <>
      {surface === 'menu' ? (
        <ActionMenu
          accessibilityLabel="프로필 차단 메뉴"
          disabled={pending}
          items={[
            {
              icon: blocked ? ShieldOff : Ban,
              key: 'block',
              label,
              onSelect: activate,
              tone: blocked ? 'default' : 'danger',
            },
          ]}
          renderTrigger={({ expanded, focusTrigger, onPress, ref }) => {
            focusMenuTrigger.current = focusTrigger;
            return (
              <IconButton
                accessibilityLabel="프로필 차단 메뉴"
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
      ) : (
        <View style={[styles.buttonTarget, { minHeight: targetHeight, width: buttonWidth }]}>
          <Button
            controlRef={(node) => {
              actionRef.current = node;
              if (typeof controlRef === 'function') {
                controlRef(node);
              } else if (controlRef) {
                controlRef.current = node;
              }
            }}
            accessibilityLabel={`${displayName} ${label}`}
            aria-haspopup="dialog"
            aria-busy={pending || undefined}
            hitSlop={
              Platform.OS === 'web'
                ? undefined
                : {
                    top: (targetHeight - buttonHeight) / 2,
                    bottom: (targetHeight - buttonHeight) / 2,
                  }
            }
            loading={pending}
            onPress={activate}
            size={mobile ? 'default' : 'compact'}
            style={{
              height: buttonHeight,
              minHeight: buttonHeight,
              minWidth: buttonWidth,
              paddingHorizontal: 0,
              width: buttonWidth,
            }}
            tone="secondary"
          >
            {label}
          </Button>
        </View>
      )}
      <ModalSheet
        dismissDisabled={pending}
        onClose={close}
        onDismiss={() =>
          surface === 'menu' ? focusMenuTrigger.current() : actionRef.current?.focus()
        }
        onShow={() => cancelRef.current?.focus()}
        title={nextBlocked ? '이 프로필을 차단할까요?' : '이 프로필의 차단을 해제할까요?'}
        visible={open}
      >
        <ConfirmationContent
          cancelLabel="취소"
          cancelRef={cancelRef}
          confirmLabel={nextBlocked ? '차단' : '차단 해제'}
          message={
            nextBlocked
              ? '서로의 프로필과 게시물을 볼 수 없게 되고, 팔로우 관계와 요청이 삭제돼요.'
              : '차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.'
          }
          onCancel={close}
          onConfirm={() => void request()}
          pending={pending}
          tone={nextBlocked ? 'danger' : 'primary'}
        />
      </ModalSheet>
    </>
  );
}

const styles = StyleSheet.create({
  buttonTarget: { alignItems: 'center', justifyContent: 'center' },
});
