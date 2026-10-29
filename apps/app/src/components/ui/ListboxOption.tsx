import { useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import { useAnimatedColorTransition } from './useAnimatedColorTransition';
import type { PressableProps, PressableStateCallbackType, ViewStyle } from 'react-native';

const borderRadiusKeys = [
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderTopStartRadius',
  'borderTopEndRadius',
  'borderBottomStartRadius',
  'borderBottomEndRadius',
] as const satisfies readonly (keyof ViewStyle)[];

type FeedbackRadiusStyle = Pick<ViewStyle, (typeof borderRadiusKeys)[number]>;

function getFeedbackRadius(style: ViewStyle): Partial<FeedbackRadiusStyle> {
  return Object.fromEntries(
    borderRadiusKeys.filter((key) => style[key] !== undefined).map((key) => [key, style[key]]),
  ) as Partial<FeedbackRadiusStyle>;
}

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

type ListboxOptionFeedbackProps = {
  active: boolean;
  disabled: boolean;
  focusVisible: boolean;
  hovered: boolean;
  label: string;
  description?: string;
  pressed: boolean;
  radiusStyle: Partial<FeedbackRadiusStyle>;
  selected: boolean;
};

function ListboxOptionFeedback({
  active,
  description,
  disabled,
  focusVisible,
  hovered,
  label,
  pressed,
  radiusStyle,
  selected,
}: ListboxOptionFeedbackProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const interaction = pressed || active || hovered;
  const backgroundColor = disabled
    ? theme.stateDisabledSurface
    : pressed
      ? theme.statePressed
      : selected
        ? theme.stateSelectedSurface
        : interaction
          ? theme.stateHover
          : 'transparent';
  const role = disabled
    ? 'instant'
    : pressed
      ? 'interaction'
      : selected
        ? 'selection'
        : active || hovered
          ? 'interaction'
          : 'selection';
  const animatedBackground = useAnimatedColorTransition({
    color: backgroundColor,
    interactionKey: pressed ? 'pressed' : active || hovered ? 'active-hover' : 'idle',
    instantKey: theme,
    reducedMotion,
    role: disabled ? 'instant' : role,
    selectionKey: selected,
  });
  const borderColor = focusVisible
    ? theme.stateFocusRing
    : disabled
      ? theme.borderDisabled
      : selected
        ? theme.stateSelectedBorder
        : 'transparent';
  const animatedBorder = useAnimatedColorTransition({
    color: borderColor,
    instantKey: theme,
    reducedMotion,
    role: focusVisible || disabled ? 'instant' : 'selection',
  });
  const borderWidth = focusVisible ? borderWidths[2] : borderWidths[1];

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.feedback,
          radiusStyle,
          {
            backgroundColor: animatedBackground,
            borderColor: animatedBorder,
            borderWidth,
            padding: space[12] - borderWidth,
          } as unknown as ViewStyle,
        ]}
      />
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
    </>
  );
}

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
  const [focusVisible, setFocusVisible] = useState(false);
  const web = Platform.OS === 'web';
  const accessibilityLabel = description ? `${label}: ${description}` : label;
  const resolveStyle = (state: PressableStateCallbackType) =>
    StyleSheet.flatten([styles.root, typeof style === 'function' ? style(state) : style]);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={web ? undefined : 'button'}
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
      style={resolveStyle}
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
      {(state) => {
        const hovered = web && Boolean((state as { hovered?: boolean }).hovered);
        const radiusStyle = getFeedbackRadius(resolveStyle(state));
        return (
          <ListboxOptionFeedback
            active={active}
            description={description}
            disabled={disabled}
            focusVisible={focusVisible}
            hovered={hovered}
            label={label}
            pressed={state.pressed}
            radiusStyle={radiusStyle}
            selected={selected}
          />
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: space[4] },
  description: textStyles.uiCopyM,
  feedback: { borderRadius: radius[12], width: '100%' },
  label: textStyles.uiLabelL,
  root: {
    borderColor: 'transparent',
    borderWidth: borderWidths[1],
    borderRadius: radius[12],
    minHeight: 48,
    padding: space[12] - borderWidths[1],
    width: '100%',
  },
});
