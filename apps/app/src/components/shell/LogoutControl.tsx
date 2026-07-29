import { LogOut } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLogout } from '@/session/logout';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { StyleProp, ViewStyle } from 'react-native';

export function LogoutControl({
  compact = false,
  style,
}: {
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { error, logout, pending } = useLogout();

  return (
    <View style={[styles.root, compact && styles.compactRoot]}>
      <Pressable
        accessibilityLabel="로그아웃"
        accessibilityRole="button"
        accessibilityState={{ busy: pending, disabled: pending }}
        disabled={pending}
        onPress={logout}
        style={[styles.control, compact && styles.compactControl, style]}
      >
        {pending ? (
          <ActivityIndicator accessibilityLabel="로그아웃 처리 중" color={theme.textSecondary} />
        ) : (
          <LogOut color={theme.textSecondary} size={20} strokeWidth={1.5} />
        )}
        {!compact ? <Text style={[styles.label, { color: theme.text }]}>로그아웃</Text> : null}
      </Pressable>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.error, { color: theme.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  compactRoot: { alignItems: 'center' },
  control: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.md,
    height: 45,
    minHeight: 45,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    width: '100%',
  },
  compactControl: {
    height: 44,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 44,
  },
  label: { fontFamily: 'SUIT', fontSize: 16, lineHeight: 21 },
  error: { fontFamily: 'SUIT', marginTop: spacing.xs, ...typography.xsm },
});
