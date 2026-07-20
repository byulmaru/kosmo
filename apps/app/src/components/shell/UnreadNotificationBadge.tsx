import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { formatUnreadNotificationBadge } from './unreadNotificationBadgeState';

export function UnreadNotificationBadge({ count }: { count: number | null }) {
  const theme = useTheme();
  const label = formatUnreadNotificationBadge(count);

  if (!label) {
    return null;
  }

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      aria-hidden={true}
      importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { backgroundColor: theme.text }]}
    >
      <Text style={[styles.label, { color: theme.background }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 16,
    minWidth: 16,
    paddingHorizontal: spacing.xs,
    position: 'absolute',
    right: -8,
    top: -7,
    zIndex: 1,
  },
  label: { fontFamily: 'SUIT', fontWeight: '700', ...typography.xsm },
});
