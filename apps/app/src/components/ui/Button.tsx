import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren, Ref } from 'react';
import type { PressableProps } from 'react-native';

type ButtonProps = PropsWithChildren<
  PressableProps & {
    controlRef?: Ref<View>;
    loading?: boolean;
    loadingText?: string;
    tone?: 'primary' | 'secondary' | 'danger';
  }
>;

export function Button({
  accessibilityLabel,
  children,
  controlRef,
  disabled,
  loading = false,
  loadingText,
  style,
  tone = 'primary',
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const label = accessibilityLabel ?? (typeof children === 'string' ? children : undefined);
  const backgroundColor =
    tone === 'primary' ? theme.primary : tone === 'danger' ? theme.danger : theme.card;
  const color = tone === 'danger' ? '#ffffff' : theme.text;
  const borderColor = tone === 'secondary' ? theme.border : 'transparent';
  const borderWidth = tone === 'secondary' ? 1 : 0;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled || loading}
      ref={controlRef}
      style={(state) => [
        styles.root,
        {
          backgroundColor,
          borderColor,
          borderWidth,
          opacity: disabled || loading ? 0.45 : state.pressed ? 0.95 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <View style={styles.loadingContent}>
          <ActivityIndicator accessibilityLabel={`${label ?? '요청'} 처리 중`} color={color} />
          {loadingText ? <Text style={[styles.label, { color }]}>{loadingText}</Text> : null}
        </View>
      ) : (
        <Text style={[styles.label, { color }]}>{children}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: radii.sm,
    minHeight: 40,
    minWidth: 120,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: {
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...typography.sm,
  },
  loadingContent: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
