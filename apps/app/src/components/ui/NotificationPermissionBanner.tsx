import { Bell, X } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import { Button } from './Button';
import { IconButton } from './IconButton';

export type NotificationPermissionBannerProps = {
  onEnable: () => void;
  onDismiss: () => void;
  pending?: boolean;
};

export function NotificationPermissionBanner({
  onEnable,
  onDismiss,
  pending = false,
}: NotificationPermissionBannerProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.actionPrimarySubtle, borderColor: theme.borderSubtle },
      ]}
    >
      <View
        accessible={false}
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.bellBadge, { backgroundColor: theme.actionPrimaryBase }]}
      >
        <Bell color={theme.actionPrimaryOnBase} size={20} strokeWidth={2} />
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: theme.actionPrimaryOnSubtle }]}>
        알림 받기
      </Text>
      <Button loading={pending} onPress={onEnable} size="compact" style={styles.enable}>
        알림 켜기
      </Button>
      <IconButton
        accessibilityLabel="배너 닫기"
        disabled={pending}
        onPress={onDismiss}
        style={styles.dismiss}
      >
        <X color={theme.foregroundSecondary} size={18} strokeWidth={2} />
      </IconButton>
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
  bellBadge: {
    alignItems: 'center',
    borderRadius: radius.full,
    flexShrink: 0,
    height: space[32],
    justifyContent: 'center',
    width: space[32],
  },
  label: { flex: 1, minWidth: 0, ...textStyles.uiLabelM },
  enable: { flexShrink: 0 },
  dismiss: { flexShrink: 0 },
});
