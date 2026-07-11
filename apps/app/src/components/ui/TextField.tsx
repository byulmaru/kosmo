import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { TextInputProps } from 'react-native';

type TextFieldProps = TextInputProps & {
  error?: string;
  label?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { error, label, multiline = false, style, ...props },
  ref,
) {
  const theme = useTheme();

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={[styles.label, { color: theme.text }]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        accessibilityLabel={props.accessibilityLabel ?? label}
        multiline={multiline}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            backgroundColor: theme.card,
            borderColor: error ? theme.danger : theme.border,
            color: theme.text,
          },
          style,
        ]}
        {...props}
      />
      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    fontFamily: 'SUIT',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.md,
  },
  multiline: {
    fontFamily: 'Pretendard',
    minHeight: 160,
    textAlignVertical: 'top',
  },
  error: { fontFamily: 'SUIT', ...typography.xsm },
});

export const TextArea = forwardRef<TextInput, TextFieldProps>(function TextArea(props, ref) {
  return <TextField {...props} ref={ref} multiline />;
});
