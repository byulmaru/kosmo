import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, textStyles } from '@/theme/tokens';

type IndicatorProps = Readonly<{
  compact: boolean;
  visible: boolean;
}>;

export function ProfileSwitcherUnreadIndicator({ compact, visible }: IndicatorProps) {
  const theme = useTheme();

  if (!visible) {
    return null;
  }

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[
        compact ? styles.compactIndicator : styles.wideIndicator,
        {
          backgroundColor: theme.actionPrimaryBase,
          borderColor: compact ? theme.backgroundCanvas : undefined,
        },
      ]}
      testID="profile-switcher-closed-unread"
    />
  );
}

export function ProfileSwitcherUnreadBadge({ count }: Readonly<{ count?: number | null }>) {
  const theme = useTheme();

  if (!count || count < 1) {
    return null;
  }

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { backgroundColor: theme.actionPrimaryBase }]}
      testID="profile-switcher-unread-count"
    >
      <Text style={[textStyles.uiLabelS, { color: theme.actionPrimaryOnBase }]}>
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compactIndicator: {
    borderRadius: radius.full,
    borderWidth: borderWidths[1],
    height: 12,
    position: 'absolute',
    right: 0,
    top: 0,
    width: 12,
  },
  wideIndicator: {
    borderRadius: radius.full,
    height: 8,
    position: 'absolute',
    right: -9,
    top: -4,
    width: 8,
  },
  badge: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
});
