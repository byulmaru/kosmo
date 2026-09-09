import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius } from '@/theme/tokens';
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

export function Checkbox({
  accessibilityLabel,
  checked,
  disabled = false,
  onCheckedChange,
}: CheckboxProps) {
  const theme = useTheme();
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
        const webState = state as { hovered?: boolean };
        const hovered = web && Boolean(webState.hovered);
        const activeColor = disabled
          ? theme.actionPrimaryDisabled
          : state.pressed
            ? theme.actionPrimaryPressed
            : hovered
              ? theme.actionPrimaryHover
              : theme.actionPrimaryBase;
        const foreground = disabled ? theme.actionPrimaryOnDisabled : theme.actionPrimaryOnBase;

        return (
          <View style={styles.visual}>
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
            <View
              style={[
                styles.indicator,
                checked === false
                  ? {
                      backgroundColor: disabled
                        ? theme.stateDisabledSurface
                        : theme.backgroundSurface,
                      borderColor: disabled ? theme.borderDisabled : theme.borderStrong,
                      borderWidth: borderWidths[1],
                    }
                  : { backgroundColor: activeColor },
              ]}
            >
              {checked === true ? (
                <Check color={foreground} size={iconSizes[20]} strokeWidth={2} />
              ) : checked === 'mixed' ? (
                <View style={[styles.mixed, { backgroundColor: foreground }]} />
              ) : null}
            </View>
          </View>
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
