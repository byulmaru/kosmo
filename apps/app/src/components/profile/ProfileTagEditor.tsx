import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { validateProfileTagDraftInput } from './profileEditState';

export type ProfileTagEditorProps = {
  disabled?: boolean;
  onChange: (next: ReadonlyArray<string>) => void;
  tags: ReadonlyArray<string>;
};

export function ProfileTagEditor({ disabled = false, onChange, tags }: ProfileTagEditorProps) {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string>();

  const addTag = () => {
    const result = validateProfileTagDraftInput(input, tags);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onChange([...tags, result.value]);
    setInput('');
    setError(undefined);
  };

  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: theme.text }]}>프로필 태그</Text>

      <View style={styles.chips}>
        {tags.map((tag, index) => (
          <View
            key={tag}
            style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Text style={[styles.tagText, { color: theme.text }]} testID="profile-tag-chip">
              #{tag}
            </Text>
            <Pressable
              accessibilityLabel={`#${tag} 제거`}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onChange(tags.filter((_, tagIndex) => tagIndex !== index))}
              style={({ pressed }) => [
                styles.removeButton,
                { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.removeLabel, { color: theme.textSecondary }]}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.inputRow}>
        <View style={styles.input}>
          <TextField
            aria-disabled={disabled}
            accessibilityLabel="프로필 태그"
            accessibilityState={{ disabled }}
            editable={!disabled}
            error={error}
            onChangeText={(next) => {
              setInput(next);
              setError(undefined);
            }}
            onSubmitEditing={addTag}
            placeholder="태그 입력"
            value={input}
          />
        </View>
        <Button
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={addTag}
          style={styles.addButton}
          tone="secondary"
        >
          태그 추가
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  label: {
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...typography.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 32,
    paddingLeft: spacing.md,
  },
  tagText: {
    fontFamily: 'SUIT',
    ...typography.sm,
  },
  removeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 32,
  },
  removeLabel: {
    fontFamily: 'SUIT',
    ...typography.lg,
  },
  inputRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
  },
  addButton: {
    minHeight: 36,
    minWidth: 88,
  },
});
