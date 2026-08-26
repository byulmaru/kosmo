import { Children, createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import type { ReactElement, RefObject } from 'react';
import type { ViewStyle } from 'react-native';

export type TabVariant = 'pill' | 'underline';

export type TabOption<Value extends string> = Readonly<{
  accessibilityLabel?: string;
  disabled?: boolean;
  label: string;
  value: Value;
}>;

export type TabListProps<Value extends string> = {
  accessibilityLabel: string;
  children: ReactElement<TabProps<Value>> | readonly ReactElement<TabProps<Value>>[];
  onValueChange: (value: Value) => void;
  value: Value;
  variant: TabVariant;
};

export type TabProps<Value extends string> = {
  option: TabOption<Value>;
};

type TabContextValue = Readonly<{
  focusValue: string;
  onValueChange: (value: string) => void;
  optionRefs: Map<string, RefObject<View | null>>;
  options: readonly TabOption<string>[];
  setFocusValue: (value: string) => void;
  value: string;
  variant: TabVariant;
}>;

const TabContext = createContext<TabContextValue | null>(null);

type WebTabListProps = { role: 'tablist' };
type WebTabProps = {
  'aria-disabled': boolean;
  'aria-selected': boolean;
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
  onPointerCancel: () => void;
  onPointerDown: () => void;
  onPointerLeave: () => void;
  onPointerUp: () => void;
  role: 'tab';
  tabIndex: -1 | 0;
};

export function TabList<Value extends string>({
  accessibilityLabel,
  children,
  onValueChange,
  value,
  variant,
}: TabListProps<Value>) {
  const theme = useTheme();
  const [focusValue, setFocusValue] = useState<string>(value);
  const optionRefs = useRef(new Map<string, RefObject<View | null>>());
  const options = Children.toArray(children).map(
    (child) => (child as ReactElement<TabProps<Value>>).props.option,
  );
  const web = Platform.OS === 'web';

  useEffect(() => setFocusValue(value), [value]);

  const contextValue: TabContextValue = {
    focusValue,
    onValueChange: onValueChange as (value: string) => void,
    optionRefs: optionRefs.current,
    options: options as readonly TabOption<string>[],
    setFocusValue,
    value,
    variant,
  };

  const content =
    variant === 'pill' ? (
      <ScrollView
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="tablist"
        contentContainerStyle={styles.pillList}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillScroll}
        {...(web ? ({ role: 'tablist' } as WebTabListProps) : undefined)}
      >
        {children}
      </ScrollView>
    ) : (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="tablist"
        style={[
          styles.underlineList,
          {
            backgroundColor: Platform.OS === 'android' ? 'transparent' : theme.card,
            borderColor: theme.borderSubtle,
          },
        ]}
        {...(web ? ({ role: 'tablist' } as WebTabListProps) : undefined)}
      >
        {Platform.OS === 'android' ? (
          <View
            pointerEvents="none"
            style={[
              styles.underlineVisualBackdrop,
              { backgroundColor: theme.card, borderColor: theme.borderSubtle },
            ]}
          />
        ) : null}
        {children}
      </View>
    );

  return <TabContext.Provider value={contextValue}>{content}</TabContext.Provider>;
}

export function Tab<Value extends string>({ option }: TabProps<Value>) {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('Tab은 TabList 안에서 사용해야 합니다.');
  }

  const theme = useTheme();
  const optionRef = useRef<View>(null);
  const [focusVisible, setFocusVisible] = useState(false);
  const [webPressed, setWebPressed] = useState(false);
  context.optionRefs.set(option.value, optionRef);

  const disabled = Boolean(option.disabled);
  const selected = context.value === option.value;
  const enabledOptions = context.options.filter((candidate) => !candidate.disabled);
  const focusEnabled = enabledOptions.some((candidate) => candidate.value === context.focusValue);
  const selectedEnabled = enabledOptions.some((candidate) => candidate.value === context.value);
  const tabStopValue = focusEnabled
    ? context.focusValue
    : selectedEnabled
      ? context.value
      : enabledOptions[0]?.value;
  const tabIndex = disabled || option.value !== tabStopValue ? -1 : 0;
  const web = Platform.OS === 'web';

  const onKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (disabled || !web || enabledOptions.length === 0) {
      return;
    }

    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      context.setFocusValue(option.value);
      context.onValueChange(option.value);
      return;
    }

    const currentIndex = enabledOptions.findIndex(({ value }) => value === option.value);
    if (currentIndex < 0) {
      return;
    }

    const target =
      event.key === 'Home'
        ? enabledOptions[0]
        : event.key === 'End'
          ? enabledOptions.at(-1)
          : event.key === 'ArrowRight'
            ? enabledOptions[(currentIndex + 1) % enabledOptions.length]
            : event.key === 'ArrowLeft'
              ? enabledOptions[(currentIndex - 1 + enabledOptions.length) % enabledOptions.length]
              : undefined;
    if (!target) {
      return;
    }

    event.preventDefault();
    context.setFocusValue(target.value);
    const targetRef = context.optionRefs.get(target.value)?.current as unknown as {
      focus?: () => void;
    } | null;
    targetRef?.focus?.();
  };

  return (
    <Pressable
      accessibilityLabel={option.accessibilityLabel ?? option.label}
      accessibilityRole="tab"
      accessibilityState={{ disabled, selected }}
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
      onKeyDown={onKeyDown}
      onPress={() => {
        if (disabled) {
          return;
        }
        context.setFocusValue(option.value);
        context.onValueChange(option.value);
      }}
      ref={optionRef}
      style={(state) => [
        context.variant === 'pill' ? styles.pillTab : styles.underlineTab,
        {
          backgroundColor:
            context.variant === 'pill'
              ? web
                ? selected
                  ? theme.background
                  : theme.card
                : 'transparent'
              : 'transparent',
          borderColor:
            context.variant === 'pill'
              ? web
                ? selected
                  ? theme.primary
                  : theme.border
                : 'transparent'
              : theme.border,
          opacity: disabled ? 0.45 : (web ? webPressed : state.pressed) ? 0.85 : 1,
          ...(focusVisible
            ? {
                outlineColor: theme.stateFocusRing,
                outlineOffset: context.variant === 'pill' ? -2 : 2,
                outlineStyle: 'solid',
                outlineWidth: borderWidths[2],
              }
            : { outlineStyle: 'none' }),
        } as ViewStyle,
      ]}
      {...(web
        ? ({
            'aria-disabled': disabled,
            'aria-selected': selected,
            onKeyDown,
            onPointerCancel: () => setWebPressed(false),
            onPointerDown: () => {
              setFocusVisible(false);
              setWebPressed(true);
            },
            onPointerLeave: () => setWebPressed(false),
            onPointerUp: () => setWebPressed(false),
            role: 'tab',
            tabIndex,
          } as WebTabProps)
        : undefined)}
    >
      {context.variant === 'pill' && !web ? (
        <View
          style={[
            styles.pillSurface,
            {
              backgroundColor: selected ? theme.background : theme.card,
              borderColor: selected ? theme.primary : theme.border,
            },
          ]}
        >
          <Text style={[styles.pillLabel, { color: theme.text }]}>{option.label}</Text>
        </View>
      ) : (
        <Text
          style={[
            context.variant === 'pill' ? styles.pillLabel : styles.underlineLabel,
            {
              color:
                context.variant === 'underline' && !selected ? theme.textSecondary : theme.text,
            },
          ]}
        >
          {option.label}
        </Text>
      )}
      {context.variant === 'underline' && selected && !disabled ? (
        <View style={[styles.tabIndicator, { backgroundColor: theme.actionPrimaryBase }]} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  underlineList: {
    borderBottomWidth: Platform.OS === 'android' ? 0 : borderWidths[1],
    flexDirection: 'row',
    height: Platform.OS === 'android' ? 48 : 44,
  },
  underlineTab: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: Platform.OS === 'android' ? 48 : 44,
    paddingBottom: Platform.OS === 'android' ? space[4] : 0,
    paddingHorizontal: space[8],
  },
  underlineLabel: textStyles.uiLabelM,
  tabIndicator: {
    borderRadius: radius.full,
    bottom: Platform.OS === 'android' ? space[4] : 0,
    height: space[4],
    left: '50%',
    position: 'absolute',
    transform: [{ translateX: -iconSizes[64] / 2 }],
    width: iconSizes[64],
  },
  underlineVisualBackdrop: {
    borderBottomWidth: borderWidths[1],
    height: 44,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pillScroll: { flexGrow: 0, maxWidth: '100%' },
  pillList: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[4],
    paddingHorizontal: space[16],
    paddingTop:
      Platform.OS === 'web'
        ? space[16]
        : Platform.OS === 'android'
          ? space[8]
          : space[8] + borderWidths[2],
  },
  pillTab: {
    alignItems: 'center',
    borderRadius: Platform.OS === 'web' ? radius[8] : 0,
    borderWidth: Platform.OS === 'web' ? borderWidths[1] : 0,
    flexShrink: 0,
    height: Platform.OS === 'web' ? 32 : Platform.OS === 'android' ? 48 : 44,
    justifyContent: 'center',
    minWidth: Platform.OS === 'web' ? undefined : Platform.OS === 'android' ? 48 : 44,
    paddingHorizontal: Platform.OS === 'web' ? space[8] : 0,
  },
  pillSurface: {
    alignItems: 'center',
    borderRadius: radius[8],
    borderWidth: borderWidths[1],
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: space[8],
  },
  pillLabel: textStyles.uiLabelM,
});
