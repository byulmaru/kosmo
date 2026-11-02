import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius } from '@/theme/tokens';
import { useAnimatedColorTransition } from './useAnimatedColorTransition';
import type { ViewStyle } from 'react-native';

export type CheckboxValue = boolean | 'mixed';

export type CheckboxProps = {
  accessibilityLabel: string;
  checked: CheckboxValue;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

type WebCheckboxProps = {
  'aria-checked': CheckboxValue;
  'aria-disabled': boolean;
  onKeyDown: (event: { key: string; preventDefault: () => void; repeat: boolean }) => void;
  onPointerDown: () => void;
  role: 'checkbox';
};

type CheckboxVisualProps = {
  checked: CheckboxValue;
  disabled: boolean;
  focusVisible: boolean;
  hovered: boolean;
  pressed: boolean;
};

function CheckboxVisual({
  checked,
  disabled,
  focusVisible,
  hovered,
  pressed,
}: CheckboxVisualProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const interaction = pressed || hovered;
  const activeColor = disabled
    ? theme.actionPrimaryDisabled
    : pressed
      ? theme.actionPrimaryPressed
      : hovered
        ? theme.actionPrimaryHover
        : theme.actionPrimaryBase;
  const backgroundColor =
    checked === false
      ? disabled
        ? theme.stateDisabledSurface
        : theme.backgroundSurface
      : activeColor;
  const animatedBackground = useAnimatedColorTransition({
    color: backgroundColor,
    interactionKey: pressed ? 'pressed' : hovered ? 'hovered' : 'idle',
    instantKey: theme,
    reducedMotion,
    role: disabled ? 'instant' : interaction ? 'interaction' : 'selection',
    selectionKey: checked,
  });
  const borderColor =
    checked === false ? (disabled ? theme.borderDisabled : theme.borderStrong) : 'transparent';
  const animatedBorder = useAnimatedColorTransition({
    color: borderColor,
    instantKey: theme,
    reducedMotion,
    role: disabled ? 'instant' : 'selection',
  });
  const interactionColor = useAnimatedColorTransition({
    color:
      !disabled && interaction ? (pressed ? theme.statePressed : theme.stateHover) : 'transparent',
    instantKey: theme,
    reducedMotion,
    role: disabled ? 'instant' : interaction ? 'interaction' : 'selection',
  });
  return (
    <View style={styles.visual}>
      {focusVisible ? (
        <View style={[styles.focusRing, { borderColor: theme.stateFocusRing }]} />
      ) : null}
      {!disabled ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.stateLayer, { backgroundColor: interactionColor } as unknown as ViewStyle]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.indicator,
          {
            backgroundColor: animatedBackground,
            borderColor: animatedBorder,
          } as unknown as ViewStyle,
        ]}
      >
        {checked === true ? (
          <Check
            color={disabled ? theme.actionPrimaryOnDisabled : theme.actionPrimaryOnBase}
            size={iconSizes[20]}
            strokeWidth={2}
          />
        ) : checked === 'mixed' ? (
          <View
            style={[
              styles.mixed,
              {
                backgroundColor: disabled
                  ? theme.actionPrimaryOnDisabled
                  : theme.actionPrimaryOnBase,
              },
            ]}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

export function Checkbox({
  accessibilityLabel,
  checked,
  disabled = false,
  onCheckedChange,
}: CheckboxProps) {
  const [focusVisible, setFocusVisible] = useState(false);
  const web = Platform.OS === 'web';
  const targetSize = web ? 32 : Platform.OS === 'ios' ? 44 : 48;
  const toggle = () => {
    if (!disabled) {
      onCheckedChange(checked !== true);
    }
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(!web || Boolean(target.matches?.(':focus-visible')));
      }}
      onPress={toggle}
      style={[styles.root, { height: targetSize, width: targetSize }]}
      {...(web
        ? ({
            'aria-checked': checked,
            'aria-disabled': disabled,
            onKeyDown: (event) => {
              if (event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                if (!event.repeat) {
                  toggle();
                }
              }
            },
            onPointerDown: () => setFocusVisible(false),
            role: 'checkbox',
          } as WebCheckboxProps)
        : undefined)}
    >
      {(state) => {
        const hovered = web && Boolean((state as { hovered?: boolean }).hovered);
        return (
          <CheckboxVisual
            checked={checked}
            disabled={disabled}
            focusVisible={focusVisible}
            hovered={hovered}
            pressed={state.pressed}
          />
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  visual: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  stateLayer: {
    bottom: 0,
    borderRadius: radius[8],
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  focusRing: {
    borderRadius: radius[8],
    borderWidth: borderWidths[2],
    bottom: 2,
    left: 2,
    pointerEvents: 'none',
    position: 'absolute',
    right: 2,
    top: 2,
  } as ViewStyle,
  indicator: {
    alignItems: 'center',
    borderWidth: borderWidths[1],
    borderRadius: radius[4],
    height: iconSizes[20],
    justifyContent: 'center',
    pointerEvents: 'none',
    width: iconSizes[20],
  },
  mixed: {
    borderRadius: radius.full,
    height: 2,
    width: 10,
  },
});
