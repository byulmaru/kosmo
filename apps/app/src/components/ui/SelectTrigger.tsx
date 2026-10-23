import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useId, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import { useAnimatedColorTransition } from './useAnimatedColorTransition';
import type { Ref } from 'react';
import type { ViewStyle } from 'react-native';

export type SelectTriggerProps = {
  accessibilityLabel: string;
  controlRef?: Ref<View>;
  error?: string;
  onPress: () => void;
  placeholder?: string;
  value?: string;
} & (
  | { controls: string; disabled?: false; open: true }
  | { controls?: string; disabled?: boolean; open?: false }
);

type SelectTriggerVisualProps = {
  disabled: boolean;
  displayedValue: string;
  error?: string;
  expanded: boolean;
  focusVisible: boolean;
  hovered: boolean;
  reducedMotion: boolean;
  theme: ReturnType<typeof useTheme>;
  value?: string;
};

function SelectTriggerVisual({
  disabled,
  displayedValue,
  error,
  expanded,
  focusVisible,
  hovered,
  reducedMotion,
  theme,
  value,
}: SelectTriggerVisualProps) {
  const Chevron = expanded ? ChevronUp : ChevronDown;
  const feedbackColor = !disabled && !focusVisible && hovered ? theme.stateHover : 'transparent';
  const animatedFeedback = useAnimatedColorTransition({
    color: feedbackColor,
    instantKey: theme,
    reducedMotion,
    role: disabled || focusVisible ? 'instant' : 'interaction',
  });

  return (
    <>
      {!disabled && focusVisible ? (
        <View
          pointerEvents="none"
          style={[
            styles.focusRing,
            { borderColor: error ? theme.feedbackDangerBorder : theme.stateFocusRing },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.surface,
          {
            backgroundColor: disabled ? theme.stateDisabledSurface : theme.backgroundSurface,
            borderColor: disabled
              ? theme.borderDisabled
              : error
                ? theme.feedbackDangerBorder
                : theme.borderDefault,
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: animatedFeedback } as unknown as ViewStyle,
          ]}
        />
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[
            styles.value,
            {
              color: disabled
                ? theme.stateDisabledForeground
                : value
                  ? theme.foregroundPrimary
                  : theme.foregroundMuted,
            },
          ]}
        >
          {displayedValue}
        </Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
          style={styles.chevron}
        >
          <Chevron
            size={24}
            color={disabled ? theme.stateDisabledForeground : theme.foregroundPrimary}
          />
        </View>
      </View>
    </>
  );
}

export function SelectTrigger({
  accessibilityLabel,
  controlRef,
  controls,
  disabled = false,
  error,
  onPress,
  open = false,
  placeholder = '선택하세요',
  value,
}: SelectTriggerProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const errorId = useId();
  const [focusVisible, setFocusVisible] = useState(false);
  const expanded = !disabled && open && Boolean(controls);
  const displayedValue = value || placeholder;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityLabel={`${accessibilityLabel}: ${displayedValue}`}
        accessibilityRole="button"
        accessibilityHint={Platform.OS !== 'web' ? error : undefined}
        accessibilityState={{ disabled, expanded }}
        disabled={disabled}
        ref={controlRef}
        onBlur={() => setFocusVisible(false)}
        onFocus={(event) => {
          const target = event.currentTarget as unknown as {
            matches?: (selector: string) => boolean;
          };
          setFocusVisible(Platform.OS !== 'web' || Boolean(target.matches?.(':focus-visible')));
        }}
        onPress={onPress}
        style={[
          styles.target,
          Platform.OS === 'web' ? { outlineStyle: 'solid', outlineWidth: 0 } : undefined,
        ]}
        {...(Platform.OS === 'web'
          ? {
              onPointerDown: () => setFocusVisible(false),
              'aria-haspopup': 'listbox' as const,
              'aria-expanded': expanded,
              'aria-controls': expanded ? controls : undefined,
              'aria-describedby': error ? errorId : undefined,
              'aria-invalid': Boolean(error),
            }
          : {})}
      >
        {(state) => (
          <SelectTriggerVisual
            disabled={disabled}
            displayedValue={displayedValue}
            error={error}
            expanded={expanded}
            focusVisible={focusVisible}
            hovered={Platform.OS === 'web' && Boolean((state as { hovered?: boolean }).hovered)}
            reducedMotion={reducedMotion}
            theme={theme}
            value={value}
          />
        )}
      </Pressable>
      {error ? (
        <Text
          nativeID={errorId}
          accessibilityLiveRegion="polite"
          style={[styles.error, { color: theme.feedbackDangerOnSubtle }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { minWidth: 0, width: '100%', gap: space[8] },
  target: { height: 48, minWidth: 0 },
  surface: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    paddingHorizontal: space[12],
    borderWidth: borderWidths[1],
    borderRadius: radius[12],
    overflow: 'hidden',
  },
  value: { ...textStyles.uiCopyL, flex: 1, minWidth: 0 },
  chevron: { width: 24, height: 24 },
  focusRing: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -4,
    right: -4,
    borderRadius: radius[12],
    borderWidth: borderWidths[2],
  },
  error: textStyles.uiCopyS,
});
