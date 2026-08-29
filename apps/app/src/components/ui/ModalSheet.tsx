import { XIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { useOverlayMotion } from '@/theme/useOverlayMotion';
import { ActionMenuPortal } from './ActionMenuPortal';
import { IconButton } from './IconButton';
import type { PropsWithChildren } from 'react';

const focusableSelector = [
  'button:not([disabled]):not([aria-disabled="true"])',
  '[href]:not([aria-disabled="true"])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
].join(',');

type Props = PropsWithChildren<{
  dismissible?: boolean;
  onClose: () => void;
  role?: 'alertdialog' | 'dialog';
  title: string;
  visible: boolean;
}>;

export function ModalSheet({
  children,
  dismissible = true,
  onClose,
  role = 'dialog',
  title,
  visible,
}: Props) {
  const theme = useTheme();
  const elevation = useElevation();
  const overlayMotion = useOverlayMotion(visible);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<View>(null);
  const webWasMountedRef = useRef(false);
  const requestClose = useCallback(() => {
    if (dismissible) {
      onClose();
    }
  }, [dismissible, onClose]);
  const restoreFocus = useCallback(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    requestAnimationFrame(() => {
      const target = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (target && document.contains(target)) {
        target.focus();
      }
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && visible) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
    }
  }, [visible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !overlayMotion.mounted) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [overlayMotion.mounted]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    if (webWasMountedRef.current && !overlayMotion.mounted) {
      restoreFocus();
    }
    webWasMountedRef.current = overlayMotion.mounted;
  }, [overlayMotion.mounted, restoreFocus]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const surface = surfaceRef.current as unknown as HTMLElement | null;
      (surface?.querySelector<HTMLElement>(focusableSelector) ?? surface)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [dismissible, visible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dismissible) {
          event.preventDefault();
          requestClose();
        }
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const surface = surfaceRef.current as unknown as HTMLElement | null;
      const controls = surface?.querySelectorAll<HTMLElement>(focusableSelector);
      const first = controls?.item(0);
      const last = controls?.item((controls?.length ?? 1) - 1);
      const active = document.activeElement;
      const target =
        !first || !last
          ? surface
          : event.shiftKey
            ? active === first || !surface?.contains(active)
              ? last
              : null
            : active === last || !surface?.contains(active)
              ? first
              : null;
      if (!target) {
        return;
      }

      event.preventDefault();
      target.focus();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismissible, requestClose, visible]);

  const content = (
    <View style={styles.backdrop}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.overlayScrim,
            opacity: overlayMotion.progress,
            pointerEvents: 'none',
          },
        ]}
      />
      <Pressable
        accessible={false}
        disabled={!dismissible}
        onPress={requestClose}
        style={StyleSheet.absoluteFill}
        testID="modal-sheet-backdrop"
      />
      <Animated.View
        style={[
          styles.motionSurface,
          {
            opacity: overlayMotion.progress,
            transform: [
              {
                translateY: overlayMotion.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              },
              {
                scale: overlayMotion.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.98, 1],
                }),
              },
            ],
          },
        ]}
      >
        <View
          {...(Platform.OS === 'web' ? { 'aria-modal': true as const, tabIndex: -1 as const } : {})}
          accessibilityLabel={title}
          accessibilityViewIsModal
          onAccessibilityEscape={requestClose}
          ref={surfaceRef}
          role={role}
          style={[
            styles.surface,
            elevation.overlay,
            { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
          ]}
        >
          <View style={styles.header}>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: theme.foregroundPrimary }]}
            >
              {title}
            </Text>
            <IconButton
              accessibilityLabel="닫기"
              disabled={!dismissible}
              onPress={requestClose}
              style={styles.close}
              targetSize={44}
              visualSize={44}
            >
              <XIcon color={theme.foregroundPrimary} size={iconSizes[20]} />
            </IconButton>
          </View>
          {children}
        </View>
      </Animated.View>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <ActionMenuPortal>
        {overlayMotion.mounted ? <View style={styles.webModal}>{content}</View> : null}
      </ActionMenuPortal>
    );
  }

  return (
    <Modal
      animationType="none"
      onDismiss={restoreFocus}
      onRequestClose={requestClose}
      transparent
      visible={overlayMotion.mounted}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: space[16],
  },
  motionSurface: { maxWidth: 420, width: '100%' },
  webModal: {
    bottom: 0,
    left: 0,
    position: 'fixed' as never,
    right: 0,
    top: 0,
    zIndex: 100,
  },
  surface: {
    borderRadius: radius[16],
    borderWidth: borderWidths[1],
    gap: space[12],
    padding: space[16],
    width: '100%',
  },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: textStyles.uiHeadingS,
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
});
