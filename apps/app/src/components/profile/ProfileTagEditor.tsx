import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { validateProfileTagDraftInput } from './profileEditState';
import { PROFILE_TAG_CHIP_VISUAL_SIZE, ProfileTagChip } from './ProfileTagChip';

export type ProfileTagEditorProps = {
  disabled?: boolean;
  onChange: (next: ReadonlyArray<string>) => void;
  tags: ReadonlyArray<string>;
};

const REMOVE_ACTION_TARGET_SIZE = Platform.select({ android: 48, ios: 44, web: 32, default: 48 });
const REMOVE_ACTION_TARGET_INSET = (REMOVE_ACTION_TARGET_SIZE - PROFILE_TAG_CHIP_VISUAL_SIZE) / 2;

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
          <View key={tag} style={styles.chipTarget}>
            <ProfileTagChip name={tag} style={styles.editableChip} />
            <Pressable
              accessibilityLabel={`#${tag} 제거`}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onChange(tags.filter((_, tagIndex) => tagIndex !== index))}
              style={({ pressed }) => [
                styles.removeButton,
                { height: REMOVE_ACTION_TARGET_SIZE, width: REMOVE_ACTION_TARGET_SIZE },
                { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
              ]}
              testID="profile-tag-remove-button"
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
  editableChip: {
    paddingRight: PROFILE_TAG_CHIP_VISUAL_SIZE,
    pointerEvents: 'none',
  },
  chipTarget: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: REMOVE_ACTION_TARGET_SIZE,
    paddingRight: REMOVE_ACTION_TARGET_INSET,
    position: 'relative',
  },
  removeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
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
