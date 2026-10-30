import { X } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import { IconButton } from './IconButton';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';

export type BannerProps = {
  action?: ReactNode;
  dismissDisabled?: boolean;
  icon?: LucideIcon;
  message: string;
  onDismiss?: () => void;
};

export function Banner({
  action,
  dismissDisabled = false,
  icon: Icon,
  message,
  onDismiss,
}: BannerProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.actionPrimarySubtle, borderColor: theme.borderSubtle },
      ]}
    >
      {Icon ? (
        <View
          accessible={false}
          accessibilityElementsHidden
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.iconBadge, { backgroundColor: theme.actionPrimaryBase }]}
        >
          <Icon color={theme.actionPrimaryOnBase} size={20} strokeWidth={2} />
        </View>
      ) : null}
      <Text style={[styles.message, { color: theme.actionPrimaryOnSubtle }]}>{message}</Text>
      {action != null ? <View style={styles.action}>{action}</View> : null}
      {onDismiss ? (
        <IconButton
          accessibilityLabel="배너 닫기"
          disabled={dismissDisabled}
          onPress={onDismiss}
          style={styles.dismiss}
        >
          <X color={theme.foregroundSecondary} size={18} strokeWidth={2} />
        </IconButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: radius[16],
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[8],
    padding: space[8],
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: radius.full,
    flexShrink: 0,
    height: space[32],
    justifyContent: 'center',
    width: space[32],
  },
  message: { flex: 1, minWidth: 0, ...textStyles.uiLabelM },
  action: { flexShrink: 0 },
  dismiss: { flexShrink: 0 },
});
