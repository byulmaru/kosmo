import { useCallback, useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { useOverlayMotion } from '@/theme/useOverlayMotion';
import { ModalSheetHost } from './ModalSheetHost';
import type { PropsWithChildren } from 'react';

type ModalOverlayBaseProps = {
  accessibilityLabel: string;
  backdropAccessibilityLabel?: string;
  backdropTestID?: string;
  dismissDisabled?: boolean;
  onDismiss?: () => void;
  onRequestClose: () => void;
  onShow?: () => void;
  role?: 'dialog' | 'alertdialog';
  testID?: string;
  visible: boolean;
};

export type ModalOverlayProps = PropsWithChildren<
  ModalOverlayBaseProps &
    (
      | { presentation?: 'sheet' | 'dialog'; iosPresentationStyle?: never }
      | {
          iosPresentationStyle?: 'fullScreen' | 'overFullScreen';
          presentation: 'fullscreen';
        }
    )
>;

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
  iosPresentationStyle,
  role = 'dialog',
  testID,
  visible,
}: ModalOverlayProps) {
  const theme = useTheme();
  const fullscreen = presentation === 'fullscreen';
  const nativeIOSFullscreen = Platform.OS === 'ios' && fullscreen;
  const iosStyle = nativeIOSFullscreen ? (iosPresentationStyle ?? 'overFullScreen') : undefined;
  const overlayMotion = useOverlayMotion(nativeIOSFullscreen ? false : visible);
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
  const nativeAndroidFullscreen = Platform.OS === 'android' && fullscreen;
  const surfaceMotionStyle = nativeIOSFullscreen
    ? undefined
    : {
        opacity: overlayMotion.progress,
        ...(fullscreen
          ? {}
          : {
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
            }),
      };

  return (
    <ModalSheetHost
      accessibilityLabel={accessibilityLabel}
      animationType={nativeIOSFullscreen ? 'fade' : 'none'}
      closeRequestDisabled={!visible || dismissDisabled}
      interactionDisabled={!visible}
      onRequestClose={requestClose}
      onShow={onShow}
      onDismiss={Platform.OS === 'android' ? undefined : onDismiss}
      {...(iosStyle ? { presentationStyle: iosStyle } : {})}
      {...(nativeAndroidFullscreen
        ? { navigationBarTranslucent: true, statusBarTranslucent: true }
        : {})}
      role={role}
      transparent={iosStyle !== 'fullScreen'}
      visible={nativeIOSFullscreen ? visible : overlayMotion.mounted}
    >
      <View
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        pointerEvents={visible ? 'auto' : 'none'}
        style={
          fullscreen
            ? styles.fullscreenRoot
            : presentation === 'sheet'
              ? styles.sheetRoot
              : styles.dialogRoot
        }
        testID={testID}
      >
        {!fullscreen ? (
          <>
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
          </>
        ) : null}
        <Animated.View
          style={[
            fullscreen
              ? styles.fullscreenSurface
              : presentation === 'sheet'
                ? styles.sheetSurface
                : styles.dialogSurface,
            surfaceMotionStyle,
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
  fullscreenRoot: { flex: 1 },
  fullscreenSurface: { flex: 1, width: '100%' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetSurface: { width: '100%' },
});
