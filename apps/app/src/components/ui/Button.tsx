import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren } from 'react';
import type { PressableProps } from 'react-native';

type ButtonProps = PropsWithChildren<
  PressableProps & {
    loading?: boolean;
    tone?: 'primary' | 'secondary' | 'danger';
  }
>;

export function Button({
  accessibilityLabel,
  children,
  disabled,
  loading = false,
  style,
  tone = 'primary',
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const label = accessibilityLabel ?? (typeof children === 'string' ? children : undefined);
  const backgroundColor =
    tone === 'primary' ? theme.primary : tone === 'danger' ? theme.danger : theme.card;
  const color = tone === 'danger' ? '#ffffff' : theme.text;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.root,
        {
          backgroundColor,
          borderColor: theme.border,
          opacity: disabled ? 0.45 : state.pressed ? 0.75 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator accessibilityLabel={`${label ?? '요청'} 처리 중`} color={color} />
      ) : (
        <Text style={[styles.label, { color }]}>{children}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: {
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...typography.sm,
  },
});
