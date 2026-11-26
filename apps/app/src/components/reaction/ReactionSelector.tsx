import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  useAnimatedColorTransition,
  useAnimatedOpacityTransition,
} from '@/components/ui/useAnimatedColorTransition';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';
import { ReactionPendingSpinner } from './ReactionPendingSpinner';
import type React from 'react';
import type { ViewStyle } from 'react-native';
import type { AnimatedOpacityValue } from '@/components/ui/useAnimatedColorTransition';

export type ReactionOption = Readonly<{
  emoji: string;
  id: string;
  label: string;
}>;

export type ReactionToggleIntent = Readonly<{
  nextSelected: boolean;
  optionId: string;
}>;

export type ReactionSelectorProps = {
  disabled?: boolean;
  errorOptionIds?: ReadonlyArray<string>;
  onToggle: (intent: ReactionToggleIntent) => void;
  options: ReadonlyArray<ReactionOption>;
  pendingOptionIds?: ReadonlyArray<string>;
  selectedOptionIds?: ReadonlyArray<string>;
};

type ReactionSelectorOptionProps = {
  error: boolean;
  onToggle: (intent: ReactionToggleIntent) => void;
  option: ReactionOption;
  pending: boolean;
  selected: boolean;
};

type ReactionSelectorOptionVisualProps = {
  hovered: boolean;
  option: ReactionOption;
  pending: boolean;
  pressed: boolean;
  selected: boolean;
};

function ReactionSelectorOptionVisual({
  hovered,
  option,
  pending,
  pressed,
  selected,
}: ReactionSelectorOptionVisualProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const interaction = pressed || hovered;
  const backgroundColor = selected
    ? pressed
      ? theme.primaryHover
      : theme.primary
    : pressed
      ? theme.backgroundSurface
      : hovered
        ? theme.stateHover
        : theme.backgroundElevated;
  const animatedBackground = useAnimatedColorTransition({
    color: backgroundColor,
    instantKey: theme,
    interactionKey: pressed ? 'pressed' : hovered ? 'hovered' : 'idle',
    reducedMotion,
    role: interaction ? 'interaction' : 'selection',
    selectionKey: selected,
  });
  const animatedOpacity = useAnimatedOpacityTransition({
    instantKey: theme,
    interactionKey: pressed ? 'pressed' : hovered ? 'hovered' : 'idle',
    opacity: selected ? 0.7 : 1,
    reducedMotion,
    role: interaction ? 'interaction' : 'selection',
    selectionKey: selected,
  });

  return (
    <>
      <Animated.View
        style={[
          styles.optionBackground,
          { backgroundColor: animatedBackground } as ViewStyle,
          { opacity: animatedOpacity as AnimatedOpacityValue },
        ]}
        testID={selected ? 'reaction-selected-background' : undefined}
      />
      <Text style={styles.emoji} testID="reaction-emoji">
        {option.emoji}
      </Text>
      {pending ? (
        <View accessibilityElementsHidden aria-hidden style={styles.pendingOverlay}>
          <ReactionPendingSpinner />
        </View>
      ) : null}
    </>
  );
}

function ReactionSelectorOption({
  error,
  onToggle,
  option,
  pending,
  selected,
}: ReactionSelectorOptionProps): React.ReactElement {
  const optionDisabled = pending;
  const accessibilityLabel = error
    ? `${option.label} 반응, 오류, 다시 시도`
    : pending
      ? `${option.label} 반응, 처리 중`
      : `${option.label} 반응`;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: pending, disabled: optionDisabled, selected }}
      aria-busy={pending}
      aria-pressed={selected}
      disabled={optionDisabled}
      onPress={() => onToggle({ nextSelected: !selected, optionId: option.id })}
      style={styles.option}
    >
      {(state) => (
        <ReactionSelectorOptionVisual
          hovered={Platform.OS === 'web' && Boolean((state as { hovered?: boolean }).hovered)}
          option={option}
          pending={pending}
          pressed={Boolean(state.pressed)}
          selected={selected}
        />
      )}
    </Pressable>
  );
}

export function ReactionSelector({
  disabled = false,
  errorOptionIds = [],
  onToggle,
  options,
  pendingOptionIds = [],
  selectedOptionIds = [],
}: ReactionSelectorProps): React.ReactElement | null {
  const theme = useTheme();

  if (disabled) {
    return null;
  }

  const errorIds = new Set(errorOptionIds);
  const pendingIds = new Set(pendingOptionIds);
  const selectedIds = new Set(selectedOptionIds);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
      ]}
    >
      {options.map((option) => {
        const error = errorIds.has(option.id);
        const pending = pendingIds.has(option.id);
        const selected = selectedIds.has(option.id);

        return (
          <ReactionSelectorOption
            error={error}
            key={option.id}
            onToggle={onToggle}
            option={option}
            pending={pending}
            selected={selected}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  option: {
    alignItems: 'center',
    borderRadius: radii.md,
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      default: { height: 44, width: 44 },
      web: { height: 32, width: 32 },
    }),
  },
  optionBackground: {
    borderRadius: radii.md,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  emoji: Platform.select({
    default: { fontSize: 24, lineHeight: 32 },
    web: { fontSize: 20, lineHeight: 24 },
  }),
  pendingOverlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
