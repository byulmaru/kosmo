import { useCallback, useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { useOverlayMotion } from '@/theme/useOverlayMotion';
import { ModalSheetHost } from './ModalSheetHost';
import type { PropsWithChildren } from 'react';

export type ModalOverlayProps = PropsWithChildren<{
  accessibilityLabel: string;
  backdropAccessibilityLabel?: string;
  backdropTestID?: string;
  dismissDisabled?: boolean;
  onDismiss?: () => void;
  onRequestClose: () => void;
  onShow?: () => void;
  presentation?: 'sheet' | 'dialog';
  role?: 'dialog' | 'alertdialog';
  testID?: string;
  visible: boolean;
}>;

export function ModalOverlay({
  accessibilityLabel,
  backdropAccessibilityLabel,
  backdropTestID,
  children,
  dismissDisabled = false,
  onDismiss,
  onRequestClose,
  onShow,
  presentation = 'dialog',
  role = 'dialog',
  testID,
  visible,
}: ModalOverlayProps) {
  const theme = useTheme();
  const overlayMotion = useOverlayMotion(visible);
  // Android Modal has no onDismiss callback; presence ending is its close boundary.
  const wasMounted = useRef(overlayMotion.mounted);

  useEffect(() => {
    if (Platform.OS === 'android' && wasMounted.current && !overlayMotion.mounted) {
      onDismiss?.();
    }
    wasMounted.current = overlayMotion.mounted;
  }, [onDismiss, overlayMotion.mounted]);

  const requestClose = useCallback(() => {
    if (visible && !dismissDisabled) {
      onRequestClose();
    }
  }, [dismissDisabled, onRequestClose, visible]);
  const hasBackdropLabel = Boolean(backdropAccessibilityLabel);

  return (
    <ModalSheetHost
      accessibilityLabel={accessibilityLabel}
      animationType="none"
      closeRequestDisabled={!visible || dismissDisabled}
      interactionDisabled={!visible}
      onRequestClose={requestClose}
      onShow={onShow}
      onDismiss={Platform.OS === 'android' ? undefined : onDismiss}
      role={role}
      transparent
      visible={overlayMotion.mounted}
    >
      <View
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        pointerEvents={visible ? 'auto' : 'none'}
        style={presentation === 'sheet' ? styles.sheetRoot : styles.dialogRoot}
        testID={testID}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.overlayScrim, opacity: overlayMotion.progress },
          ]}
        />
        <Pressable
          accessibilityElementsHidden={!hasBackdropLabel}
          accessibilityLabel={backdropAccessibilityLabel}
          accessibilityRole={hasBackdropLabel ? 'button' : undefined}
          accessible={hasBackdropLabel}
          aria-hidden={!hasBackdropLabel}
          disabled={!visible || dismissDisabled}
          importantForAccessibility={hasBackdropLabel ? 'auto' : 'no'}
          onPress={requestClose}
          style={StyleSheet.absoluteFill}
          testID={backdropTestID}
        />
        <Animated.View
          style={[
            presentation === 'sheet' ? styles.sheetSurface : styles.dialogSurface,
            {
              opacity: overlayMotion.progress,
              transform:
                presentation === 'sheet'
                  ? [
                      {
                        translateY: overlayMotion.progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [space[16], 0],
                        }),
                      },
                    ]
                  : [
                      {
                        translateY: overlayMotion.progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [space[12], 0],
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
          {children}
        </Animated.View>
      </View>
    </ModalSheetHost>
  );
}

const styles = StyleSheet.create({
  dialogRoot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: space[16],
  },
  dialogSurface: { maxWidth: 420, width: '100%' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetSurface: { width: '100%' },
});
