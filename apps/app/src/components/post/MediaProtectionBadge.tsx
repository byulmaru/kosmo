import { ShieldIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, radii, spacing } from '@/theme/tokens';

export function MediaProtectionBadge() {
  const theme = useTheme();

  return (
    <Tooltip label="AI 학습방지 필터가 적용되었어요. 이 표시는 나에게만 보여요.">
      <View
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.badge, { backgroundColor: theme.overlayScrim }]}
        testID="media-protection-badge"
      >
        <ShieldIcon color={theme.fixedWhite} size={iconSizes[16]} strokeWidth={2} />
      </View>
    </Tooltip>
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
