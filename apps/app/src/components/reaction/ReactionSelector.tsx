import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  onToggle: (intent: ReactionToggleIntent) => void;
  options: ReadonlyArray<ReactionOption>;
  selectedOptionIds?: ReadonlyArray<string>;
};

export function ReactionSelector({
  onToggle,
  options,
  selectedOptionIds = [],
}: ReactionSelectorProps): React.ReactElement {
  const theme = useTheme();
  const selectedIds = new Set(selectedOptionIds);

  return (
    <View style={[styles.root, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {options.map((option) => {
        const selected = selectedIds.has(option.id);

        return (
          <Pressable
            accessibilityLabel={`${option.label} 반응`}
            accessibilityRole="button"
            accessibilityState={{ disabled: false }}
            aria-pressed={selected}
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
                borderColor: selected ? theme.accent : theme.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={styles.emoji}>{option.emoji}</Text>
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
});
