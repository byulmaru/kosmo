import { Children, createContext, useContext, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Circle, Svg } from 'react-native-svg';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, layoutRecipes, radius, space, textStyles } from '@/theme/tokens';
import { useAnimatedColorTransition } from './useAnimatedColorTransition';
import type { PropsWithChildren, ReactElement, ReactNode, RefObject } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type RadioOption<Value extends string> = Readonly<{
  description?: string;
  disabled?: boolean;
  label: string;
  value: Value;
}>;

export type RadioOptionProps<Value extends string> = PropsWithChildren<{
  option: RadioOption<Value>;
  style?: PressableProps['style'];
}>;

export type RadioGroupProps<Value extends string> = {
  accessibilityLabel: string;
  children?:
    | ReactElement<RadioOptionProps<Value>>
    | readonly ReactElement<RadioOptionProps<Value>>[];
  disabled?: boolean;
  onChange: (value: Value) => void;
  style?: StyleProp<ViewStyle>;
  value: Value;
};

type RadioGroupContextValue = Readonly<{
  disabled: boolean;
  onChange: (value: string) => void;
  optionRefs: Map<string, RefObject<View | null>>;
  options: readonly RadioOption<string>[];
  value: string;
}>;

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

type WebGroupProps = { role: 'radiogroup' };
type WebRadioProps = {
  'aria-checked': boolean;
  'aria-disabled': boolean;
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
  onPointerDown: () => void;
  role: 'radio';
  tabIndex: -1 | 0;
};

export function RadioGroup<Value extends string>({
  accessibilityLabel,
  children,
  disabled = false,
  onChange,
  style,
  value,
}: RadioGroupProps<Value>) {
  const optionRefs = useRef(new Map<string, RefObject<View | null>>());
  const options = Children.toArray(children).map(
    (child) => (child as ReactElement<RadioOptionProps<Value>>).props.option,
  );
  const web = Platform.OS === 'web';

  return (
    <RadioGroupContext.Provider
      value={{
        disabled,
        onChange: onChange as (value: string) => void,
        optionRefs: optionRefs.current,
        options: options as readonly RadioOption<string>[],
        value,
      }}
    >
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="radiogroup"
        accessibilityState={{ disabled }}
        style={style}
        {...(web ? ({ role: 'radiogroup' } as WebGroupProps) : undefined)}
      >
        {children}
      </View>
    </RadioGroupContext.Provider>
  );
}

type RadioOptionVisualProps<Value extends string> = {
  checked: boolean;
  children: ReactNode;
  disabled: boolean;
  hovered: boolean;
  option: RadioOption<Value>;
  pressed: boolean;
};

function RadioOptionVisual<Value extends string>({
  checked,
  children,
  disabled,
  hovered,
  option,
  pressed,
}: RadioOptionVisualProps<Value>) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const interaction = pressed || hovered;
  const interactionColor = useAnimatedColorTransition({
    color: disabled
      ? theme.stateDisabledSurface
      : interaction
        ? pressed
          ? theme.statePressed
          : theme.stateHover
        : 'transparent',
    instantKey: theme,
    reducedMotion,
    role: disabled ? 'instant' : interaction ? 'interaction' : 'selection',
  });
  const selectedColor = useAnimatedColorTransition({
    color: disabled
      ? theme.stateDisabledForeground
      : checked
        ? theme.stateSelectedBorder
        : theme.foregroundSecondary,
    instantKey: theme,
    reducedMotion,
    role: disabled ? 'instant' : 'selection',
  });
  const interactionBorder = useAnimatedColorTransition({
    color: disabled ? theme.borderDisabled : 'transparent',
    instantKey: theme,
    reducedMotion,
    role: disabled ? 'instant' : 'selection',
  });
  const indicatorColor = disabled ? theme.stateDisabledForeground : selectedColor;
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.feedback,
          {
            backgroundColor: interactionColor,
            borderColor: interactionBorder,
            borderWidth: disabled ? borderWidths[1] : borderWidths[0],
          } as unknown as ViewStyle,
        ]}
      />
      <Svg
        accessible={Platform.OS === 'web' ? undefined : false}
        aria-hidden
        focusable={false}
        style={styles.indicator}
        height={iconSizes[20]}
        width={iconSizes[20]}
        viewBox="0 0 20 20"
      >
        <AnimatedCircle
          cx={10}
          cy={10}
          r={9}
          fill="none"
          stroke={indicatorColor as unknown as string}
          strokeWidth={borderWidths[2]}
        />
        <AnimatedCircle
          cx={10}
          cy={10}
          r={5}
          fill={indicatorColor as unknown as string}
          opacity={disabled ? (checked ? 1 : 0) : checked ? 1 : 0}
        />
      </Svg>
      {children ?? (
        <View style={styles.content}>
          <Text
            style={[
              styles.label,
              { color: disabled ? theme.stateDisabledForeground : theme.foregroundPrimary },
            ]}
          >
            {option.label}
          </Text>
          {option.description ? (
            <Text
              style={[
                styles.description,
                { color: disabled ? theme.stateDisabledForeground : theme.foregroundSecondary },
              ]}
            >
              {option.description}
            </Text>
          ) : null}
        </View>
      )}
    </>
  );
}

export function RadioOption<Value extends string>({
  children,
  option,
  style,
}: RadioOptionProps<Value>) {
  const context = useContext(RadioGroupContext);
  if (!context) {
    throw new Error('RadioOption은 RadioGroup 안에서 사용해야 합니다.');
  }

  const optionRef = useRef<View>(null);
  const [focusVisible, setFocusVisible] = useState(false);
  const theme = useTheme();
  context.optionRefs.set(option.value, optionRef);

  const disabled = context.disabled || Boolean(option.disabled);
  const checked = context.value === option.value;
  const accessibilityLabel = option.description
    ? `${option.label}: ${option.description}`
    : option.label;
  const enabledOptions = context.options.filter(
    (candidate) => !context.disabled && !candidate.disabled,
  );
  const selectedEnabled = enabledOptions.some((candidate) => candidate.value === context.value);
  const tabStopValue = selectedEnabled ? context.value : enabledOptions[0]?.value;
  const tabIndex = disabled || option.value !== tabStopValue ? -1 : 0;
  const web = Platform.OS === 'web';
  const onKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (disabled || !web) {
      return;
    }

    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (direction === 0 || enabledOptions.length === 0) {
      return;
    }

    const currentIndex = enabledOptions.findIndex((candidate) => candidate.value === option.value);
    if (currentIndex < 0) {
      return;
    }

    event.preventDefault();
    const target =
      enabledOptions[(currentIndex + direction + enabledOptions.length) % enabledOptions.length];
    context.onChange(target.value);
    const targetRef = context.optionRefs.get(target.value)?.current as unknown as {
      focus?: () => void;
    } | null;
    targetRef?.focus?.();
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        if (Platform.OS !== 'web') {
          return;
        }
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(Boolean(target.matches?.(':focus-visible')));
      }}
      onPress={() => {
        if (!disabled) {
          context.onChange(option.value);
        }
      }}
      ref={optionRef}
      style={(state) => {
        const borderWidth = focusVisible ? borderWidths[2] : borderWidths[1];
        return [
          styles.root,
          {
            borderColor: focusVisible ? theme.stateFocusRing : 'transparent',
            borderWidth,
            ...(web ? ({ outlineStyle: 'none' } as unknown as ViewStyle) : undefined),
            padding: space[12] - borderWidth,
          },
          typeof style === 'function' ? style(state) : style,
        ];
      }}
      {...(web
        ? ({
            'aria-checked': checked,
            'aria-disabled': disabled,
            onKeyDown,
            onPointerDown: () => setFocusVisible(false),
            role: 'radio',
            tabIndex,
          } as WebRadioProps)
        : undefined)}
    >
      {(state) => (
        <RadioOptionVisual
          checked={checked}
          children={children}
          disabled={disabled}
          hovered={web && Boolean((state as { hovered?: boolean }).hovered)}
          option={option}
          pressed={state.pressed}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: radius[12],
    borderColor: 'transparent',
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[12],
    padding: space[12] - borderWidths[1],
  },
  indicator: { flexShrink: 0 },
  feedback: {
    borderRadius: radius[12],
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  content: { ...layoutRecipes.labelSupportStack, flex: 1 },
  label: textStyles.uiLabelL,
  description: textStyles.uiCopyM,
});
