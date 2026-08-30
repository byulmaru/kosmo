import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space } from '@/theme/tokens';
import type { StyleProp, ViewStyle } from 'react-native';

export type SliderProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  max?: number;
  min?: number;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  step?: number;
  style?: StyleProp<ViewStyle>;
  value: number;
};

type WebSliderProps = {
  'aria-disabled': boolean;
  'aria-valuemax': number;
  'aria-valuemin': number;
  'aria-valuenow': number;
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
  onPointerDown: (event: WebPointerEvent) => void;
  onPointerMove: (event: WebPointerEvent) => void;
  onPointerUp: (event: WebPointerEvent) => void;
  role: 'slider';
  tabIndex: -1 | 0;
};

type WebPointerEvent = {
  currentTarget?: {
    getBoundingClientRect?: () => { left: number };
    setPointerCapture?: (pointerId: number) => void;
  };
  nativeEvent: {
    clientX?: number;
    locationX?: number;
    pointerId?: number;
  };
};

function snapValue(value: number, min: number, max: number, step: number): number {
  const bounded = Math.min(max, Math.max(min, value));
  const snapped = min + Math.round((bounded - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(10));
}

export function Slider({
  accessibilityLabel,
  disabled = false,
  max = 100,
  min = 0,
  onValueChange,
  onValueCommit,
  step = 1,
  style,
  value,
}: SliderProps) {
  const theme = useTheme();
  const [focusVisible, setFocusVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const web = Platform.OS === 'web';
  const safeMax = Math.max(min, max);
  const safeStep = step > 0 ? step : 1;
  const currentValue = snapValue(value, min, safeMax, safeStep);
  const range = safeMax - min;
  const percentage = range === 0 ? 0 : ((currentValue - min) / range) * 100;
  const currentValueRef = useRef(currentValue);
  const disabledRef = useRef(disabled);
  const layoutWidthRef = useRef(0);
  const minRef = useRef(min);
  const safeMaxRef = useRef(safeMax);
  const safeStepRef = useRef(safeStep);
  const rangeRef = useRef(range);
  const onValueChangeRef = useRef(onValueChange);
  const onValueCommitRef = useRef(onValueCommit);
  const gestureInitialValueRef = useRef(currentValue);
  const gestureValueRef = useRef<number | null>(null);
  const gestureChangedRef = useRef(false);
  const gestureActiveRef = useRef(false);

  currentValueRef.current = currentValue;
  disabledRef.current = disabled;
  minRef.current = min;
  safeMaxRef.current = safeMax;
  safeStepRef.current = safeStep;
  rangeRef.current = range;
  onValueChangeRef.current = onValueChange;
  onValueCommitRef.current = onValueCommit;

  const emitDiscreteValue = (nextValue: number) => {
    if (disabledRef.current) {
      return;
    }

    const next = snapValue(nextValue, minRef.current, safeMaxRef.current, safeStepRef.current);
    if (next === currentValueRef.current) {
      return;
    }
    onValueChangeRef.current(next);
    onValueCommitRef.current?.(next);
  };

  const emitGestureValue = (nextValue: number) => {
    if (disabledRef.current) {
      return;
    }

    const next = snapValue(nextValue, minRef.current, safeMaxRef.current, safeStepRef.current);
    const previous = gestureValueRef.current ?? gestureInitialValueRef.current;
    if (next === previous) {
      return;
    }

    gestureValueRef.current = next;
    gestureChangedRef.current =
      next !== gestureInitialValueRef.current || gestureChangedRef.current;
    onValueChangeRef.current(next);
  };

  const emitCoordinate = (locationX: number) => {
    const layoutWidth = layoutWidthRef.current;
    if (layoutWidth <= 0 || !Number.isFinite(locationX)) {
      return;
    }

    const usableWidth = Math.max(0, layoutWidth - space[12] * 2);
    const offset = Math.min(usableWidth, Math.max(0, locationX - space[12]));
    const position = usableWidth === 0 ? 0 : offset / usableWidth;
    emitGestureValue(minRef.current + position * rangeRef.current);
  };

  const onKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (disabledRef.current || !web) {
      return;
    }

    const nextValue =
      event.key === 'Home'
        ? min
        : event.key === 'End'
          ? safeMax
          : event.key === 'ArrowRight' || event.key === 'ArrowUp'
            ? currentValueRef.current + safeStep
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
              ? currentValueRef.current - safeStep
              : undefined;
    if (nextValue === undefined) {
      return;
    }

    event.preventDefault();
    emitDiscreteValue(nextValue);
  };

  const onAccessibilityAction = (event: { nativeEvent: { actionName: string } }) => {
    const direction =
      event.nativeEvent.actionName === 'increment'
        ? 1
        : event.nativeEvent.actionName === 'decrement'
          ? -1
          : 0;
    if (direction !== 0) {
      emitDiscreteValue(currentValueRef.current + direction * safeStep);
    }
  };

  const beginGesture = (locationX: number) => {
    if (disabledRef.current) {
      return;
    }
    gestureActiveRef.current = true;
    gestureInitialValueRef.current = currentValueRef.current;
    gestureValueRef.current = null;
    gestureChangedRef.current = false;
    setDragging(true);
    emitCoordinate(locationX);
  };

  const moveGesture = (locationX: number) => {
    if (gestureActiveRef.current) {
      emitCoordinate(locationX);
    }
  };

  const finishGesture = () => {
    if (!gestureActiveRef.current) {
      return;
    }
    gestureActiveRef.current = false;
    setDragging(false);
    const finalValue = gestureValueRef.current;
    const changed = gestureChangedRef.current;
    gestureValueRef.current = null;
    gestureChangedRef.current = false;
    if (changed && finalValue !== null) {
      onValueCommitRef.current?.(finalValue);
    }
  };

  const pointerLocationX = (event: WebPointerEvent) => {
    const { clientX, locationX } = event.nativeEvent;
    if (typeof locationX === 'number' && Number.isFinite(locationX)) {
      return locationX;
    }
    const left = event.currentTarget?.getBoundingClientRect?.()?.left;
    if (
      typeof clientX === 'number' &&
      Number.isFinite(clientX) &&
      typeof left === 'number' &&
      Number.isFinite(left)
    ) {
      return clientX - left;
    }
    return Number.NaN;
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderGrant: (event) => {
          beginGesture(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          moveGesture(event.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          finishGesture();
        },
        onPanResponderTerminate: () => {
          gestureActiveRef.current = false;
          setDragging(false);
          gestureValueRef.current = null;
          gestureChangedRef.current = false;
        },
        onStartShouldSetPanResponder: () => !disabledRef.current,
      }),
    [],
  );

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityState={{ disabled }}
      accessibilityValue={{ max: safeMax, min, now: currentValue }}
      disabled={disabled}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        if (!web) {
          return;
        }
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(Boolean(target.matches?.(':focus-visible')));
      }}
      onAccessibilityAction={onAccessibilityAction}
      onLayout={(event) => {
        layoutWidthRef.current = event.nativeEvent.layout.width;
      }}
      style={(state) => {
        const webState = state as { hovered?: boolean };
        const hovered = web && Boolean(webState.hovered);
        return [
          styles.root,
          {
            backgroundColor: disabled
              ? theme.stateDisabledSurface
              : state.pressed || dragging
                ? theme.statePressed
                : hovered
                  ? theme.stateHover
                  : undefined,
            ...(web && focusVisible
              ? ({
                  outlineColor: theme.stateFocusRing,
                  outlineOffset: 2,
                  outlineStyle: 'solid',
                  outlineWidth: borderWidths[2],
                } as unknown as ViewStyle)
              : ({ outlineStyle: 'none' } as unknown as ViewStyle)),
          },
          style,
        ];
      }}
      {...(web ? undefined : panResponder.panHandlers)}
      {...(web
        ? ({
            'aria-disabled': disabled,
            'aria-valuemax': safeMax,
            'aria-valuemin': min,
            'aria-valuenow': currentValue,
            onKeyDown,
            onPointerDown: (event) => {
              setFocusVisible(false);
              const pointerId = event.nativeEvent.pointerId;
              if (typeof pointerId === 'number') {
                event.currentTarget?.setPointerCapture?.(pointerId);
              }
              beginGesture(pointerLocationX(event));
            },
            onPointerMove: (event) => moveGesture(pointerLocationX(event)),
            onPointerUp: () => finishGesture(),
            role: 'slider',
            tabIndex: disabled ? -1 : 0,
          } as WebSliderProps)
        : undefined)}
    >
      <View pointerEvents="none" style={styles.track}>
        <View
          style={[
            styles.trackBase,
            { backgroundColor: disabled ? theme.borderDisabled : theme.borderDefault },
          ]}
        />
        <View
          style={[
            styles.trackFill,
            {
              backgroundColor: disabled ? theme.stateDisabledForeground : theme.stateSelectedBorder,
            },
            { width: `${percentage}%` },
          ]}
        />
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: disabled ? theme.stateDisabledForeground : theme.stateSelectedBorder,
              left: `${percentage}%`,
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: space[12],
  },
  thumb: {
    borderRadius: radius.full,
    height: space[16],
    marginLeft: -space[8],
    position: 'absolute',
    width: space[16],
  },
  track: {
    justifyContent: 'center',
    minHeight: space[48],
    position: 'relative',
  },
  trackBase: {
    borderRadius: radius[4],
    height: borderWidths[2],
    position: 'absolute',
    width: '100%',
  },
  trackFill: {
    borderRadius: radius[4],
    height: borderWidths[2],
    position: 'absolute',
    left: 0,
  },
});
