import { X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { readBannerDismissal, writeBannerDismissal } from '@/lib/bannerDismissalStorage';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import { IconButton } from './IconButton';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type BannerProps = {
  action?: ReactNode;
  dismissalKey?: string;
  dismissDisabled?: boolean;
  icon?: LucideIcon;
  message: string;
  style?: StyleProp<ViewStyle>;
};

export function Banner(props: BannerProps) {
  return <BannerContent key={props.dismissalKey} {...props} />;
}

function BannerContent({
  action,
  dismissalKey,
  dismissDisabled = false,
  icon: Icon,
  message,
  style,
}: BannerProps) {
  const [dismissed, setDismissed] = useState(
    () => dismissalKey !== undefined && readBannerDismissal(dismissalKey),
  );
  const theme = useTheme();

  if (dismissed) {
    return null;
  }

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.backgroundSurface, borderColor: theme.borderDefault },
        style,
      ]}
    >
      {Icon ? (
        <View
          accessible={false}
          accessibilityElementsHidden
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={styles.icon}
        >
          <Icon color={theme.foregroundSecondary} size={20} strokeWidth={2} />
        </View>
      ) : null}
      <Text style={[styles.message, { color: theme.foregroundPrimary }]}>{message}</Text>
      {action != null ? <View style={styles.action}>{action}</View> : null}
      {dismissalKey !== undefined ? (
        <IconButton
          accessibilityLabel="배너 닫기"
          disabled={dismissDisabled}
          onPress={() => {
            setDismissed(true);
            writeBannerDismissal(dismissalKey);
          }}
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
    borderRadius: radius[8],
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[8],
    paddingHorizontal: space[12],
    paddingVertical: space[8],
  },
  icon: {
    flexShrink: 0,
  },
  message: { flex: 1, minWidth: 0, ...textStyles.uiCopyL },
  action: { flexShrink: 0 },
  dismiss: { flexShrink: 0 },
});
