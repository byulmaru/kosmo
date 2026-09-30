import { Children, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, motion, radius, space, textStyles } from '@/theme/tokens';
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
  pillInset?: boolean;
  pillWrap?: boolean;
  value: Value;
  variant: TabVariant;
};

export type TabProps<Value extends string> = {
  option: TabOption<Value>;
};

type TabContextValue = Readonly<{
  focusValue: string;
  onValueChange: (value: string) => void;
  onTabLayout: (value: string, frame: TabFrame) => void;
  optionRefs: Map<string, RefObject<View | null>>;
  options: readonly TabOption<string>[];
  setFocusValue: (value: string) => void;
  value: string;
  variant: TabVariant;
}>;

type TabFrame = Readonly<{ left: number; width: number }>;

const TabContext = createContext<TabContextValue | null>(null);

type WebTabListProps = { role: 'tablist' };
type WebTabProps = {
  'aria-disabled': boolean;
  'aria-selected': boolean;
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
  onPointerDown: () => void;
  role: 'tab';
  tabIndex: -1 | 0;
};

export function TabList<Value extends string>({
  accessibilityLabel,
  children,
  onValueChange,
  pillInset = true,
  pillWrap = false,
  value,
  variant,
}: TabListProps<Value>) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [focusValue, setFocusValue] = useState<string>(value);
  const [frames, setFrames] = useState<Partial<Record<string, TabFrame>>>({});
  const optionRefs = useRef(new Map<string, RefObject<View | null>>());
  const selectionLeft = useRef(new Animated.Value(0)).current;
  const selectionRight = useRef(new Animated.Value(iconSizes[64])).current;
  const selectionWidth = useMemo(
    () => Animated.subtract(selectionRight, selectionLeft),
    [selectionLeft, selectionRight],
  );
  const previousSelectedValue = useRef<string | undefined>(undefined);
  const options = Children.toArray(children).map(
    (child) => (child as ReactElement<TabProps<Value>>).props.option,
  );
  const web = Platform.OS === 'web';

  useEffect(() => setFocusValue(value), [value]);

  const selectedOption = options.find((option) => option.value === value);
  const selectedFrame =
    selectedOption && !selectedOption.disabled ? frames[selectedOption.value] : undefined;

  useEffect(() => {
    if (variant !== 'underline' || !selectedFrame) {
      return;
    }

    const targetLeft = selectedFrame.left + selectedFrame.width / 2 - iconSizes[64] / 2;
    const targetRight = targetLeft + iconSizes[64];
    const valueChanged =
      previousSelectedValue.current !== undefined && previousSelectedValue.current !== value;
    previousSelectedValue.current = value;

    if (reducedMotion || !valueChanged) {
      selectionLeft.stopAnimation();
      selectionRight.stopAnimation();
      selectionLeft.setValue(targetLeft);
      selectionRight.setValue(targetRight);
      return;
    }

    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    selectionLeft.stopAnimation((currentLeft) => {
      selectionRight.stopAnimation((currentRight) => {
        if (cancelled) {
          return;
        }

        const movingRight = (targetLeft + targetRight) / 2 > (currentLeft + currentRight) / 2;
        const standardEasing = Easing.bezier(...motion.easingPoints.standard);
        const edgeEasing = (direction: 'in' | 'out') => (progress: number) => {
          const easedProgress = standardEasing(progress);
          return direction === 'out'
            ? Math.sin((easedProgress * Math.PI) / 2)
            : 1 - Math.cos((easedProgress * Math.PI) / 2);
        };
        animation = Animated.parallel([
          Animated.timing(selectionLeft, {
            duration: motion.duration.standard,
            easing: edgeEasing(movingRight ? 'in' : 'out'),
            toValue: targetLeft,
            useNativeDriver: false,
          }),
          Animated.timing(selectionRight, {
            duration: motion.duration.standard,
            easing: edgeEasing(movingRight ? 'out' : 'in'),
            toValue: targetRight,
            useNativeDriver: false,
          }),
        ]);
        animation.start();
      });
    });

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [reducedMotion, selectedFrame, selectionLeft, selectionRight, value, variant]);

  const contextValue: TabContextValue = {
    focusValue,
    onValueChange: onValueChange as (value: string) => void,
    onTabLayout: (tabValue, frame) => {
      setFrames((current) => {
        const previous = current[tabValue];
        return previous?.left === frame.left && previous.width === frame.width
          ? current
          : { ...current, [tabValue]: frame };
      });
    },
    optionRefs: optionRefs.current,
    options: options as readonly TabOption<string>[],
    setFocusValue,
    value,
    variant,
  };

  const content =
    variant === 'pill' ? (
      pillWrap ? (
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="tablist"
          style={[styles.pillList, !pillInset && styles.pillFlush, styles.pillWrap]}
          {...(web ? ({ role: 'tablist' } as WebTabListProps) : undefined)}
        >
          {children}
        </View>
      ) : (
        <ScrollView
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="tablist"
          contentContainerStyle={[styles.pillList, !pillInset && styles.pillFlush]}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
          {...(web ? ({ role: 'tablist' } as WebTabListProps) : undefined)}
        >
          {children}
        </ScrollView>
      )
    ) : (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="tablist"
        style={[
          styles.underlineList,
          {
            backgroundColor: Platform.OS === 'android' ? 'transparent' : theme.backgroundCanvas,
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
              { backgroundColor: theme.backgroundCanvas, borderColor: theme.borderSubtle },
            ]}
          />
        ) : null}
        {children}
        {selectedFrame ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabIndicator,
              {
                backgroundColor: theme.actionPrimaryBase,
                left: selectionLeft,
                width: selectionWidth,
              },
            ]}
          />
        ) : null}
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
  const reducedMotion = useReducedMotion();
  const optionRef = useRef<View>(null);
  const [focusVisible, setFocusVisible] = useState(false);
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
      onLayout={(event) => {
        const { width, x: left } = event.nativeEvent.layout;
        context.onTabLayout(option.value, { left, width });
      }}
      ref={optionRef}
      style={[
        context.variant === 'pill' ? styles.pillTab : styles.underlineTab,
        {
          backgroundColor: 'transparent',
          borderColor: context.variant === 'pill' ? 'transparent' : theme.borderDefault,
          opacity: disabled ? 0.45 : 1,
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
            onPointerDown: () => setFocusVisible(false),
            role: 'tab',
            tabIndex,
          } as WebTabProps)
        : undefined)}
    >
      {(state) => {
        const feedbackColor = disabled
          ? 'transparent'
          : state.pressed
            ? theme.statePressed
            : web && (state as { hovered?: boolean }).hovered
              ? theme.stateHover
              : 'transparent';
        const feedbackTransition = web
          ? ({
              transitionDuration: `${reducedMotion ? motion.duration.instant : motion.duration.fast}ms`,
              transitionProperty: 'background-color',
              transitionTimingFunction: motion.easing.standard,
            } as unknown as ViewStyle)
          : undefined;
        const feedback = (
          <TabFeedback
            color={feedbackColor}
            pill={context.variant === 'pill'}
            pressedColor={theme.statePressed}
            reducedMotion={reducedMotion}
            web={web}
            webTransition={feedbackTransition}
          />
        );

        return (
          <>
            {context.variant === 'pill' ? (
              <View
                style={[
                  styles.pillSurface,
                  {
                    backgroundColor: selected ? theme.backgroundCanvas : theme.backgroundSurface,
                    borderColor: selected ? theme.actionPrimaryBase : theme.borderDefault,
                  },
                ]}
              >
                {feedback}
                <Text style={[styles.pillLabel, { color: theme.foregroundPrimary }]}>
                  {option.label}
                </Text>
              </View>
            ) : (
              <>
                {feedback}
                <Text
                  style={[
                    styles.underlineLabel,
                    {
                      color:
                        context.variant === 'underline' && !selected
                          ? theme.foregroundSecondary
                          : theme.foregroundPrimary,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </>
            )}
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  feedbackSurface: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  pillFeedback: { borderRadius: radius[8] },
  underlineList: {
    borderBottomWidth: Platform.OS === 'android' ? 0 : borderWidths[1],
    flexDirection: 'row',
    height: Platform.OS === 'android' ? 48 : 44,
    position: 'relative',
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
    position: 'absolute',
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
  pillFlush: { paddingHorizontal: 0, paddingTop: 0 },
  pillWrap: { flexWrap: 'wrap' },
  pillTab: {
    alignItems: 'center',
    borderRadius: Platform.OS === 'web' ? radius[8] : 0,
    flexShrink: 0,
    height: Platform.OS === 'web' ? 32 : Platform.OS === 'android' ? 48 : 44,
    justifyContent: 'center',
    minWidth: Platform.OS === 'web' ? undefined : Platform.OS === 'android' ? 48 : 44,
    paddingHorizontal: 0,
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

type TabFeedbackProps = {
  color: string;
  pill: boolean;
  pressedColor: string;
  reducedMotion: boolean;
  web: boolean;
  webTransition?: ViewStyle;
};

function TabFeedback({
  color,
  pill,
  pressedColor,
  reducedMotion,
  web,
  webTransition,
}: TabFeedbackProps) {
  const opacity = useRef(new Animated.Value(color === 'transparent' ? 0 : 1)).current;
  const visible = color !== 'transparent';

  useEffect(() => {
    if (web) {
      return;
    }

    opacity.stopAnimation();
    if (reducedMotion) {
      opacity.setValue(visible ? 1 : 0);
      return;
    }

    const animation = Animated.timing(opacity, {
      duration: motion.duration.fast,
      easing: Easing.bezier(...motion.easingPoints.standard),
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
    });
    animation.start();

    return () => animation.stop();
  }, [opacity, reducedMotion, visible, web]);

  const style = [
    styles.feedbackSurface,
    pill && styles.pillFeedback,
    web ? webTransition : undefined,
    web ? { backgroundColor: color } : { backgroundColor: pressedColor, opacity },
  ];

  return web ? (
    <View pointerEvents="none" style={style} />
  ) : (
    <Animated.View pointerEvents="none" style={style} />
  );
}
