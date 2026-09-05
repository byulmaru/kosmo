import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { radius, space, textStyles } from '@/theme/tokens';

export type ToastProps = Readonly<{
  message: string;
  action?: Readonly<{ label: string; onPress: () => void }>;
  tone: 'danger' | 'info' | 'success' | 'warning';
}>;

export function Toast({ message, action, tone }: ToastProps) {
  const theme = useTheme();
  const elevation = useElevation();
  const toastColors = getToastColors(theme, tone);
  return (
    <View
      style={[
        styles.toast,
        action ? styles.actionToast : undefined,
        elevation.floating,
        {
          backgroundColor: toastColors?.background,
          borderLeftColor: toastColors?.border,
          borderLeftWidth: toastColors?.border ? 4 : undefined,
        },
      ]}
    >
      <Text style={[styles.message, { color: toastColors?.foreground }]}>{message}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={Platform.OS === 'android' ? 2 : undefined}
          onPress={() => action.onPress()}
          style={styles.action}
        >
          <Text style={[styles.actionLabel, { color: toastColors?.foreground }]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function getToastColors(theme: ReturnType<typeof useTheme>, tone: ToastProps['tone']) {
  if (tone === 'danger') {
    return {
      background: theme.feedbackDangerSubtle,
      border: theme.feedbackDangerBase,
      foreground: theme.feedbackDangerOnSubtle,
    };
  }
  if (tone === 'success') {
    return {
      background: theme.feedbackSuccessSubtle,
      border: theme.feedbackSuccessBase,
      foreground: theme.feedbackSuccessOnSubtle,
    };
  }
  if (tone === 'warning') {
    return {
      background: theme.feedbackWarningSubtle,
      border: theme.feedbackWarningBase,
      foreground: theme.feedbackWarningOnSubtle,
    };
  }
  return {
    background: theme.feedbackInfoSubtle,
    border: theme.feedbackInfoBase,
    foreground: theme.feedbackInfoOnSubtle,
  };
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space[4],
    paddingVertical: space[4],
  },
  actionLabel: {
    ...textStyles.uiLabelM,
  },
  message: {
    flex: 1,
    ...textStyles.uiCopyM,
  },
  actionToast: { paddingVertical: space[4] },
  toast: {
    alignItems: 'center',
    borderRadius: radius[12],
    flexDirection: 'row',
    gap: space[12],
    maxWidth: 360,
    paddingHorizontal: space[16],
    paddingVertical: space[12],
    pointerEvents: 'auto',
    width: '100%',
  },
});
