import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { validateProfileTagDraftInput } from './profileEditState';
import { ProfileTagChip } from './ProfileTagChip';

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

      {tags.length > 0 ? (
        <View style={styles.chips}>
          {tags.map((tag, index) => (
            <ProfileTagChip
              disabled={disabled}
              key={tag}
              name={tag}
              onRemove={() => onChange(tags.filter((_, tagIndex) => tagIndex !== index))}
              removable
            />
          ))}
        </View>
      ) : null}

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
    gap: space[8],
  },
  label: textStyles.uiLabelL,
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[8],
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[8],
  },
  input: {
    flex: 1,
  },
  addButton: {
    minWidth: 88,
  },
});
