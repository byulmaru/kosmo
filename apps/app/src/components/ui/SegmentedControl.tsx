import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, motion, radius, space, textStyles } from '@/theme/tokens';
import type { RefObject } from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';

export type SegmentedControlOption<Value extends string> = Readonly<{
  accessibilityLabel?: string;
  label: string;
  value: Value;
}>;

export type SegmentedControlOptions<Value extends string> =
  | readonly [SegmentedControlOption<Value>, SegmentedControlOption<Value>]
  | readonly [
      SegmentedControlOption<Value>,
      SegmentedControlOption<Value>,
      SegmentedControlOption<Value>,
    ]
  | readonly [
      SegmentedControlOption<Value>,
      SegmentedControlOption<Value>,
      SegmentedControlOption<Value>,
      SegmentedControlOption<Value>,
    ];

export type SegmentedControlProps<Value extends string> = {
  accessibilityLabel: string;
  disabled?: boolean;
  onValueChange: (value: Value) => void;
  options: SegmentedControlOptions<Value>;
  value: Value;
};

type WebGroupProps = { role: 'radiogroup' };
type WebRadioProps = {
  'aria-checked': boolean;
  'aria-disabled': boolean;
  onKeyDown: (event: { key: string; preventDefault: () => void; repeat: boolean }) => void;
  onPointerDown: () => void;
  role: 'radio';
  tabIndex: -1 | 0;
};

type SegmentedControlItemProps<Value extends string> = {
  disabled: boolean;
  index: number;
  onLayout: (event: LayoutChangeEvent) => void;
  onValueChange: (value: Value) => void;
  option: SegmentedControlOption<Value>;
  optionRefs: Map<Value, RefObject<View | null>>;
  options: SegmentedControlOptions<Value>;
  selectedValue: Value;
};

function SegmentedControlItem<Value extends string>({
  disabled,
  index,
  onLayout,
  onValueChange,
  option,
  optionRefs,
  options,
  selectedValue,
}: SegmentedControlItemProps<Value>) {
  const theme = useTheme();
  const optionRef = useRef<View>(null);
  const [focusVisible, setFocusVisible] = useState(false);
  const selected = option.value === selectedValue;
  const web = Platform.OS === 'web';
  optionRefs.set(option.value, optionRef);

  const onKeyDown = (event: { key: string; preventDefault: () => void; repeat: boolean }) => {
    if (disabled || !web) {
      return;
    }

    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      if (!event.repeat) {
        onValueChange(option.value);
      }
      return;
    }

    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (direction === 0) {
      return;
    }

    event.preventDefault();
    const target = options[(index + direction + options.length) % options.length];
    onValueChange(target.value);
    const targetRef = optionRefs.get(target.value)?.current as unknown as {
      focus?: () => void;
    } | null;
    targetRef?.focus?.();
  };

  return (
    <Pressable
      accessibilityLabel={option.accessibilityLabel ?? option.label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onLayout={onLayout}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(!web || Boolean(target.matches?.(':focus-visible')));
      }}
      onPress={() => {
        if (!disabled) {
          onValueChange(option.value);
        }
      }}
      ref={optionRef}
      style={styles.item}
      {...(web
        ? ({
            'aria-checked': selected,
            'aria-disabled': disabled,
            onKeyDown,
            onPointerDown: () => setFocusVisible(false),
            role: 'radio',
            tabIndex: disabled || !selected ? -1 : 0,
          } as WebRadioProps)
        : undefined)}
    >
      {(state) => {
        const hovered = web && Boolean((state as { hovered?: boolean }).hovered);
        return (
          <>
            {hovered || state.pressed ? (
              <View
                style={[
                  styles.stateLayer,
                  { backgroundColor: state.pressed ? theme.statePressed : theme.stateHover },
                ]}
              />
            ) : null}
            {focusVisible ? (
              <View style={[styles.focusRing, { borderColor: theme.stateFocusRing }]} />
            ) : null}
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: disabled ? theme.stateDisabledForeground : theme.foregroundPrimary },
              ]}
            >
              {option.label}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

export function SegmentedControl<Value extends string>({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  options,
  value,
}: SegmentedControlProps<Value>) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const optionRefs = useRef(new Map<Value, RefObject<View | null>>()).current;
  const selectionLeft = useRef(new Animated.Value(0)).current;
  const selectionWidth = useRef(new Animated.Value(0)).current;
  const previousValue = useRef<Value | undefined>(undefined);
  const [frames, setFrames] = useState<Partial<Record<Value, { left: number; width: number }>>>({});
  const selectedValue = options.some((option) => option.value === value) ? value : options[0].value;
  const web = Platform.OS === 'web';
  const selectedFrame = frames[selectedValue];

  useEffect(() => {
    if (!selectedFrame) {
      return;
    }

    const targetLeft = selectedFrame.left + 4;
    const targetWidth = selectedFrame.width - 8;
    const valueChanged =
      previousValue.current !== undefined && previousValue.current !== selectedValue;
    previousValue.current = selectedValue;

    if (reducedMotion || !valueChanged) {
      selectionLeft.stopAnimation();
      selectionWidth.stopAnimation();
      selectionLeft.setValue(targetLeft);
      selectionWidth.setValue(targetWidth);
      return;
    }

    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    selectionLeft.stopAnimation((currentLeft) => {
      selectionWidth.stopAnimation((currentWidth) => {
        if (cancelled) {
          return;
        }

        const currentRight = currentLeft + currentWidth;
        const stretchedWidth = targetWidth + space[8];
        const stretchDuration = motion.duration.standard * 0.3;
        const settleDuration = motion.duration.standard - stretchDuration;
        const easing = Easing.bezier(...motion.easingPoints.standard);
        const movingRight = targetLeft > currentLeft;
        animation = Animated.sequence([
          Animated.parallel([
            Animated.timing(selectionLeft, {
              duration: stretchDuration,
              easing,
              toValue: movingRight ? currentLeft : currentRight - stretchedWidth,
              useNativeDriver: false,
            }),
            Animated.timing(selectionWidth, {
              duration: stretchDuration,
              easing,
              toValue: stretchedWidth,
              useNativeDriver: false,
            }),
          ]),
          Animated.parallel([
            Animated.timing(selectionLeft, {
              duration: settleDuration,
              easing,
              toValue: targetLeft,
              useNativeDriver: false,
            }),
            Animated.timing(selectionWidth, {
              duration: settleDuration,
              easing,
              toValue: targetWidth,
              useNativeDriver: false,
            }),
          ]),
        ]);
        animation.start();
      });
    });

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [reducedMotion, selectedFrame, selectedValue, selectionLeft, selectionWidth]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
      accessibilityState={{ disabled }}
      style={[
        styles.root,
        {
          backgroundColor: disabled ? theme.stateDisabledSurface : theme.backgroundSurface,
          borderColor: disabled ? theme.borderDisabled : theme.borderDefault,
        },
      ]}
      {...(web ? ({ role: 'radiogroup' } as WebGroupProps) : undefined)}
    >
      {selectedFrame ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.selection,
            {
              backgroundColor: theme.stateSelectedSurface,
              borderColor: theme.stateSelectedBorder,
              left: selectionLeft,
              width: selectionWidth,
            },
          ]}
        />
      ) : null}
      {options.map((option, index) => (
        <SegmentedControlItem
          disabled={disabled}
          index={index}
          key={option.value}
          onLayout={(event) => {
            const { width, x: left } = event.nativeEvent.layout;
            setFrames((current) => {
              const previous = current[option.value];
              return previous?.left === left && previous.width === width
                ? current
                : { ...current, [option.value]: { left, width } };
            });
          }}
          onValueChange={onValueChange}
          option={option}
          optionRefs={optionRefs}
          options={options}
          selectedValue={selectedValue}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    height: 48,
    width: 320,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: space[12],
  },
  selection: {
    borderRadius: radius[8],
    borderWidth: borderWidths[1],
    bottom: 4,
    pointerEvents: 'none',
    position: 'absolute',
    top: 4,
  } as ViewStyle,
  stateLayer: {
    borderRadius: radius[8],
    bottom: 4,
    left: 4,
    pointerEvents: 'none',
    position: 'absolute',
    right: 4,
    top: 4,
  } as ViewStyle,
  focusRing: {
    borderRadius: radius[12],
    borderWidth: borderWidths[2],
    bottom: 2,
    left: 2,
    pointerEvents: 'none',
    position: 'absolute',
    right: 2,
    top: 2,
  } as ViewStyle,
  label: {
    ...textStyles.uiLabelM,
    maxWidth: '100%',
    textAlign: 'center',
  },
});
