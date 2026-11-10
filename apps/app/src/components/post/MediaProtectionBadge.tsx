import { ShieldIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, radii, spacing } from '@/theme/tokens';

export function MediaProtectionBadge() {
  const theme = useTheme();

  return (
    <View
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { backgroundColor: theme.overlayScrim }]}
      testID="media-protection-badge"
    >
      <ShieldIcon color={theme.fixedWhite} size={iconSizes[16]} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: radii.full,
    justifyContent: 'center',
    padding: spacing.xs,
  },
});
