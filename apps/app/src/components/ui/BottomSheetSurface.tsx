import { useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius } from '@/theme/tokens';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type Props = PropsWithChildren<{
  closeDisabled?: boolean;
  handleTestID?: string;
  initialHeight?: number;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function BottomSheetSurface({
  children,
  closeDisabled = false,
  handleTestID,
  initialHeight,
  onClose,
  style,
  testID,
}: Props) {
  const theme = useTheme();
  const { height: viewportHeight } = useWindowDimensions();
  const { top: topInset } = useSafeAreaInsets();
  const maxHeight = Math.max(0, viewportHeight - topInset);
  const collapsedHeight = Math.min(initialHeight ?? maxHeight, maxHeight);
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState(0);
  const expandable = initialHeight !== undefined && collapsedHeight < maxHeight;
  const dismiss = () => {
    if (!closeDisabled) {
      onClose();
    }
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !closeDisabled &&
          Math.abs(gesture.dy) > 8 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) &&
          (expandable || gesture.dy > 0),
        onPanResponderMove: (_event, gesture) => setDragY(gesture.dy),
        onPanResponderRelease: (_event, gesture) => {
          setDragY(0);
          if (closeDisabled) {
            return;
          }
          if (gesture.dy < -56 || gesture.vy < -0.5) {
            if (expandable) {
              setExpanded(true);
            }
          } else if (gesture.dy > 56 || gesture.vy > 0.5) {
            if (expanded && gesture.dy < maxHeight - collapsedHeight + 56) {
              setExpanded(false);
            } else {
              onClose();
            }
          }
        },
        onPanResponderTerminate: () => setDragY(0),
      }),
    [closeDisabled, collapsedHeight, expandable, expanded, maxHeight, onClose],
  );
  const height =
    initialHeight === undefined
      ? undefined
      : expanded
        ? Math.max(0, maxHeight - Math.max(0, dragY))
        : collapsedHeight + Math.max(0, -dragY);
  const translateY = expanded ? 0 : Math.max(0, dragY);

  return (
    <View
      accessibilityViewIsModal
      onAccessibilityEscape={dismiss}
      style={[
        styles.surface,
        { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
        style,
        { height, maxHeight, transform: [{ translateY }] },
      ]}
      testID={testID}
    >
      <View {...responder.panHandlers} style={styles.handleTarget}>
        <Pressable
          accessible
          accessibilityLabel={expandable ? (expanded ? '시트 접기' : '시트 펼치기') : '시트 닫기'}
          accessibilityRole="button"
          disabled={closeDisabled}
          importantForAccessibility="yes"
          onPress={() => {
            if (expandable) {
              setExpanded((value) => !value);
            } else {
              dismiss();
            }
          }}
          style={styles.handlePressable}
          testID={handleTestID}
        >
          <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  handle: { borderRadius: radius.full, height: 4, width: 36 },
  handlePressable: { alignItems: 'center', height: 48, justifyContent: 'center', width: 56 },
  handleTarget: { alignItems: 'center', height: 48, justifyContent: 'center' },
  surface: {
    borderTopLeftRadius: radius[16],
    borderTopRightRadius: radius[16],
    borderWidth: borderWidths[1],
    overflow: 'hidden',
    width: '100%',
  },
});
