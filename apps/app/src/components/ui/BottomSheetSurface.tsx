import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, motion, radius } from '@/theme/tokens';
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
  const reducedMotion = useReducedMotion();
  const { height: viewportHeight } = useWindowDimensions();
  const { top: topInset } = useSafeAreaInsets();
  const maxHeight = Math.max(0, viewportHeight - topInset);
  const collapsedHeight = Math.min(initialHeight ?? maxHeight, maxHeight);
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const dismissY = useRef(new Animated.Value(0)).current;
  const stretchY = useRef(new Animated.Value(0)).current;
  const expandable = initialHeight !== undefined && collapsedHeight < maxHeight;
  const stretchable = initialHeight === undefined;
  useEffect(() => {
    if (!dismissing) {
      return;
    }
    if (reducedMotion) {
      dismissY.setValue(maxHeight);
      return;
    }
    const points = motion.easingPoints.exit;
    const animation = Animated.timing(dismissY, {
      duration: motion.duration.standard,
      easing: Easing.bezier(points[0], points[1], points[2], points[3]),
      toValue: maxHeight,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [dismissY, dismissing, maxHeight, reducedMotion]);
  const dismiss = () => {
    if (!closeDisabled) {
      onClose();
    }
  };
  const responder = useMemo(() => {
    const settleStretch = () => {
      if (!stretchable) {
        return;
      }
      if (reducedMotion) {
        stretchY.setValue(0);
        return;
      }
      const points = motion.easingPoints.standard;
      Animated.timing(stretchY, {
        duration: motion.duration.standard,
        easing: Easing.bezier(points[0], points[1], points[2], points[3]),
        toValue: 0,
        useNativeDriver: false,
      }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        !closeDisabled &&
        !dismissing &&
        Math.abs(gesture.dy) > 8 &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx) &&
        (expandable || stretchable || gesture.dy > 0),
      onPanResponderMove: (_event, gesture) => {
        if (stretchable) {
          stretchY.setValue(Math.min(24, Math.max(0, -gesture.dy) / 4));
        }
        setDragY(gesture.dy);
      },
      onPanResponderRelease: (_event, gesture) => {
        settleStretch();
        if (closeDisabled) {
          setDragY(0);
          return;
        }
        if (gesture.dy < -56 || gesture.vy < -0.5) {
          setDragY(0);
          if (expandable) {
            setExpanded(true);
          }
        } else if (gesture.dy > 56 || gesture.vy > 0.5) {
          if (expanded) {
            setDragY(0);
            setExpanded(false);
          } else {
            dismissY.setValue(Math.max(0, gesture.dy));
            setDismissing(true);
            setDragY(0);
            onClose();
          }
        } else {
          setDragY(0);
        }
      },
      onPanResponderTerminate: () => {
        settleStretch();
        setDragY(0);
      },
    });
  }, [
    closeDisabled,
    collapsedHeight,
    dismissY,
    dismissing,
    expandable,
    expanded,
    maxHeight,
    onClose,
    reducedMotion,
    stretchY,
    stretchable,
  ]);
  const height =
    initialHeight === undefined
      ? undefined
      : expanded
        ? Math.max(0, maxHeight - Math.max(0, dragY))
        : collapsedHeight + Math.max(0, -dragY);
  const translateY = dismissing ? dismissY : expanded ? 0 : Math.max(0, dragY);

  return (
    <Animated.View
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
      {stretchable ? (
        <Animated.View style={{ paddingBottom: stretchY }}>{children}</Animated.View>
      ) : (
        children
      )}
    </Animated.View>
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
