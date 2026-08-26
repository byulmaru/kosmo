import { forwardRef, useId, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import type { TextInputProps, TextStyle } from 'react-native';

type TextFieldProps = TextInputProps & {
  error?: string;
  label?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    accessibilityHint,
    editable = true,
    error,
    label,
    multiline = false,
    onBlur,
    onFocus,
    style,
    ...props
  },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const errorId = useId();
  const webValidationProps =
    Platform.OS === 'web'
      ? { 'aria-describedby': error ? errorId : undefined, 'aria-invalid': Boolean(error) }
      : {};

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={[styles.label, { color: theme.foregroundPrimary }]}>{label}</Text>
      ) : null}
      <TextInput
        ref={ref}
        accessibilityHint={accessibilityHint}
        accessibilityLabel={props.accessibilityLabel ?? label}
        editable={editable}
        multiline={multiline}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={editable ? theme.foregroundMuted : theme.stateDisabledForeground}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            backgroundColor: editable ? theme.backgroundSurface : theme.stateDisabledSurface,
            borderColor:
              Platform.OS === 'web' && focused
                ? theme.borderDefault
                : error
                  ? theme.feedbackDangerBorder
                  : focused
                    ? theme.borderFocus
                    : editable
                      ? theme.borderDefault
                      : theme.borderDisabled,
            borderWidth: focused ? borderWidths[2] : borderWidths[1],
            color: editable ? theme.foregroundPrimary : theme.stateDisabledForeground,
            ...(Platform.OS === 'web' && focused
              ? ({
                  outlineColor: error ? theme.feedbackDangerBorder : theme.stateFocusRing,
                  outlineOffset: 2,
                  outlineStyle: 'solid',
                  outlineWidth: borderWidths[2],
                } as unknown as TextStyle)
              : undefined),
          },
          style,
        ]}
        {...webValidationProps}
        {...props}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          nativeID={errorId}
          style={[styles.error, { color: theme.feedbackDangerOnSubtle }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: space[4] },
  label: textStyles.uiLabelM,
  input: {
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    minHeight: 44,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
    ...textStyles.uiCopyL,
  },
  multiline: {
    minHeight: 160,
    textAlignVertical: 'top',
    ...textStyles.contentM,
  },
  error: textStyles.uiCopyS,
});

export const TextArea = forwardRef<TextInput, TextFieldProps>(function TextArea(props, ref) {
  return <TextField {...props} ref={ref} multiline />;
});
