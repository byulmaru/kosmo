import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';
import type React from 'react';

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

export function ReactionSelector({
  disabled = false,
  errorOptionIds = [],
  onToggle,
  options,
  pendingOptionIds = [],
  selectedOptionIds = [],
}: ReactionSelectorProps): React.ReactElement {
  const theme = useTheme();
  const errorIds = new Set(errorOptionIds);
  const pendingIds = new Set(pendingOptionIds);
  const selectedIds = new Set(selectedOptionIds);

  return (
    <View style={[styles.root, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {options.map((option) => {
        const error = errorIds.has(option.id);
        const pending = pendingIds.has(option.id);
        const selected = selectedIds.has(option.id);
        const optionDisabled = disabled || pending;
        const accessibilityLabel = error
          ? `${option.label} 반응, 오류, 다시 시도`
          : pending
            ? `${option.label} 반응, 처리 중`
            : `${option.label} 반응`;

        return (
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ busy: pending, disabled: optionDisabled }}
            aria-busy={pending}
            aria-pressed={selected}
            disabled={optionDisabled}
            key={option.id}
            onPress={() => onToggle({ nextSelected: !selected, optionId: option.id })}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: selected
                  ? pressed
                    ? theme.primaryHover
                    : theme.primary
                  : pressed
                    ? theme.surface
                    : theme.card,
                borderColor: error ? theme.danger : selected ? theme.accent : theme.border,
                opacity: optionDisabled ? 0.55 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={styles.emoji}>{option.emoji}</Text>
            {pending ? (
              <ActivityIndicator
                accessibilityElementsHidden
                aria-hidden
                color={theme.text}
                size="small"
                style={[styles.pendingIndicator, styles.pendingIndicatorPointerEvents]}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  option: {
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 44,
  },
  emoji: { fontSize: 24, lineHeight: 32 },
  pendingIndicator: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    transform: [{ scale: 0.55 }],
  },
  pendingIndicatorPointerEvents: { pointerEvents: 'none' },
});
