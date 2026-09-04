import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, motion, radius, space, textStyles } from '@/theme/tokens';
import type { PressableProps, ViewStyle } from 'react-native';

export type ListboxOptionProps = {
  active?: boolean;
  description?: string;
  disabled?: boolean;
  label: string;
  nativeID?: string;
  onSelect: () => void;
  selected?: boolean;
  style?: PressableProps['style'];
};

type WebListboxOptionProps = {
  'aria-disabled': boolean;
  'aria-selected': boolean;
  onPointerDown: () => void;
  role: 'option';
  tabIndex: -1;
};

export function ListboxOption({
  active = false,
  description,
  disabled = false,
  label,
  nativeID,
  onSelect,
  selected = false,
  style,
}: ListboxOptionProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [focusVisible, setFocusVisible] = useState(false);
  const web = Platform.OS === 'web';
  const accessibilityLabel = description ? `${label}: ${description}` : label;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={'option' as never}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      nativeID={nativeID}
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
      onPress={() => {
        if (!disabled) {
          onSelect();
        }
      }}
      style={(state) => {
        const webState = state as { hovered?: boolean };
        const hovered = web && Boolean(webState.hovered);
        const borderWidth = focusVisible
          ? borderWidths[2]
          : selected || disabled
            ? borderWidths[1]
            : borderWidths[0];
        const transitionDuration =
          state.pressed || hovered
            ? motion.duration.fast
            : selected
              ? motion.duration.standard
              : motion.duration.fast;
        return [
          styles.root,
          web
            ? ({
                transitionDuration: `${reducedMotion ? motion.duration.instant : transitionDuration}ms`,
                transitionProperty: 'background-color, border-color',
                transitionTimingFunction: motion.easing.standard,
              } as unknown as ViewStyle)
            : undefined,
          {
            backgroundColor: disabled
              ? theme.stateDisabledSurface
              : state.pressed
                ? theme.statePressed
                : selected
                  ? theme.stateSelectedSurface
                  : active || hovered
                    ? theme.stateHover
                    : undefined,
            borderColor: focusVisible
              ? theme.stateFocusRing
              : disabled
                ? theme.borderDisabled
                : selected
                  ? theme.stateSelectedBorder
                  : 'transparent',
            borderWidth,
            padding: space[12] - borderWidth,
          },
          typeof style === 'function' ? style(state) : style,
        ];
      }}
      {...(web
        ? ({
            'aria-disabled': disabled,
            'aria-selected': selected,
            onPointerDown: () => setFocusVisible(false),
            role: 'option',
            tabIndex: -1,
          } as WebListboxOptionProps)
        : undefined)}
    >
      <View style={styles.content}>
        <Text
          style={[
            styles.label,
            { color: disabled ? theme.stateDisabledForeground : theme.foregroundPrimary },
          ]}
        >
          {label}
        </Text>
        {description ? (
          <Text
            style={[
              styles.description,
              { color: disabled ? theme.stateDisabledForeground : theme.foregroundSecondary },
            ]}
          >
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: space[4] },
  description: textStyles.uiCopyM,
  label: textStyles.uiLabelL,
  root: {
    borderRadius: radius[12],
    minHeight: 48,
    width: '100%',
  },
});
