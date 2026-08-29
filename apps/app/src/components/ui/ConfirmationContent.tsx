import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import { Button } from './Button';
import type { ReactNode } from 'react';

type Props = {
  cancelLabel: string;
  confirmDisabled?: boolean;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
  supportingContent?: ReactNode;
  tone?: 'danger' | 'primary';
};

export function ConfirmationContent({
  cancelLabel,
  confirmDisabled,
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  pending = false,
  supportingContent,
  tone = 'primary',
}: Props) {
  const theme = useTheme();
  const verticalTargetInset = Platform.OS === 'ios' ? 2 : Platform.OS === 'android' ? 4 : 0;
  const targetHeight = Platform.OS === 'web' ? 40 : Platform.OS === 'ios' ? 44 : 48;
  const hitSlop = verticalTargetInset
    ? { bottom: verticalTargetInset, left: 0, right: 0, top: verticalTargetInset }
    : undefined;

  return (
    <View style={styles.root}>
      <Text style={[styles.message, { color: theme.foregroundSecondary }]}>{message}</Text>
      {supportingContent}
      <View style={[styles.actions, { minHeight: targetHeight }]}>
        <Button
          disabled={pending}
          hitSlop={hitSlop}
          onPress={() => onCancel()}
          style={styles.action}
          tone="secondary"
        >
          {cancelLabel}
        </Button>
        <Button
          aria-busy={pending || undefined}
          disabled={pending ? undefined : confirmDisabled}
          hitSlop={hitSlop}
          loading={pending}
          onPress={() => onConfirm()}
          style={styles.action}
          tone={tone}
        >
          {confirmLabel}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[12] },
  message: textStyles.uiCopyM,
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[8],
    justifyContent: 'flex-end',
  },
  action: { height: 40, width: 120 },
});
