import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/tokens';

export function UnreadNotificationBadge({ count }: { count: number | null }) {
  const theme = useTheme();

  if (!count || count < 1) {
    return null;
  }

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      aria-hidden={true}
      importantForAccessibility="no-hide-descendants"
      style={[styles.dot, { backgroundColor: theme.accent }]}
      testID="unread-notification-dot"
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: radii.full,
    height: 8,
    position: 'absolute',
    right: 2,
    top: -1,
    width: 8,
    zIndex: 1,
  },
});
