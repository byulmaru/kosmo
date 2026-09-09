import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes, space, textStyles } from '@/theme/tokens';
import { Button } from './Button';
import type { ReactNode, Ref } from 'react';

type Props = {
  cancelLabel: string;
  cancelRef?: Ref<View>;
  children?: ReactNode;
  confirmDisabled?: boolean;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
  tone?: 'danger' | 'primary';
};

export function ConfirmationContent({
  cancelLabel,
  cancelRef,
  children,
  confirmDisabled,
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  pending = false,
  tone = 'primary',
}: Props) {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <Text style={[styles.message, { color: theme.foregroundSecondary }]}>{message}</Text>
      {children}
      <View style={styles.actions}>
        <Button
          controlRef={cancelRef}
          disabled={pending}
          onPress={() => onCancel()}
          style={styles.action}
          tone="secondary"
        >
          {cancelLabel}
        </Button>
        <Button
          aria-busy={pending || undefined}
          disabled={pending ? undefined : confirmDisabled}
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
    ...layoutRecipes.dialogActions,
    alignItems: 'center',
  },
  action: { width: 120 },
});
