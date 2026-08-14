import { Children, createContext, useContext, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import type { PropsWithChildren, ReactElement, RefObject } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';

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
      onPress={() => {
        if (!disabled) {
          context.onChange(option.value);
        }
      }}
      ref={optionRef}
      style={style}
      {...(web
        ? ({
            'aria-checked': checked,
            'aria-disabled': disabled,
            onKeyDown,
            role: 'radio',
            tabIndex,
          } as WebRadioProps)
        : undefined)}
    >
      {children}
    </Pressable>
  );
}
