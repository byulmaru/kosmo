import { useCallback, useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { useOverlayMotion } from '@/theme/useOverlayMotion';
import { ModalSheetHost } from './ModalSheetHost';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type ModalOverlayProps = PropsWithChildren<{
  accessibilityLabel: string;
  backdropAccessibilityLabel?: string;
  backdropTestID?: string;
  onBackdropPress?: () => void;
  dismissDisabled?: boolean;
  onDismiss?: () => void;
  onRequestClose: () => void;
  onShow?: () => void;
  navigationBarTranslucent?: boolean;
  presentation?: 'sheet' | 'dialog' | 'drawer';
  rootStyle?: StyleProp<ViewStyle>;
  role?: 'dialog' | 'alertdialog';
  surfaceNativeID?: string;
  surfaceStyle?: StyleProp<ViewStyle>;
  statusBarTranslucent?: boolean;
  testID?: string;
  visible: boolean;
}>;

export function ModalOverlay({
  accessibilityLabel,
  backdropAccessibilityLabel,
  backdropTestID,
  onBackdropPress,
  children,
  dismissDisabled = false,
  onDismiss,
  onRequestClose,
  onShow,
  navigationBarTranslucent,
  presentation = 'dialog',
  rootStyle,
  role = 'dialog',
  surfaceStyle,
  surfaceNativeID,
  statusBarTranslucent,
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
  const pressBackdrop = useCallback(() => {
    if (visible && !dismissDisabled) {
      (onBackdropPress ?? onRequestClose)();
    }
  }, [dismissDisabled, onBackdropPress, onRequestClose, visible]);
  const hasBackdropLabel = Boolean(backdropAccessibilityLabel);

  return (
    <ModalSheetHost
      accessibilityLabel={accessibilityLabel}
      animationType="none"
      closeRequestDisabled={!visible || dismissDisabled}
      interactionDisabled={!visible}
      navigationBarTranslucent={navigationBarTranslucent}
      onRequestClose={requestClose}
      onShow={onShow}
      onDismiss={Platform.OS === 'android' ? undefined : onDismiss}
      role={role}
      statusBarTranslucent={statusBarTranslucent}
      transparent
      visible={overlayMotion.mounted}
    >
      <View
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          presentation === 'sheet'
            ? styles.sheetRoot
            : presentation === 'drawer'
              ? styles.drawerRoot
              : styles.dialogRoot,
          rootStyle,
        ]}
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
          onPress={pressBackdrop}
          style={StyleSheet.absoluteFill}
          testID={backdropTestID}
        />
        <Animated.View
          nativeID={surfaceNativeID}
          style={[
            presentation === 'sheet'
              ? styles.sheetSurface
              : presentation === 'drawer'
                ? styles.drawerSurface
                : styles.dialogSurface,
            surfaceStyle,
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
                  : presentation === 'drawer'
                    ? [
                        {
                          translateX: overlayMotion.progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-space[16], 0],
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
  drawerRoot: { flex: 1, flexDirection: 'row', minHeight: 0 },
  drawerSurface: { height: '100%', maxWidth: '100%' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetSurface: { width: '100%' },
});
