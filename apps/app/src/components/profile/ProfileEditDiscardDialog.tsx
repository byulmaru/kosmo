import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, layoutRecipes, radii, spacing, typography } from '@/theme/tokens';
import { Button } from '../ui/Button';
import { ModalOverlay } from '../ui/ModalOverlay';
import type { RefObject } from 'react';

type FocusableRef = RefObject<{ focus: () => void } | null>;

type ProfileEditDiscardDialogProps = {
  onContinue: () => void;
  onDiscard: () => void;
  returnFocusRef?: FocusableRef;
  visible: boolean;
};

export function ProfileEditDiscardDialog({
  onContinue,
  onDiscard,
  returnFocusRef,
  visible,
}: ProfileEditDiscardDialogProps) {
  const theme = useTheme();

  return (
    <ModalOverlay
      accessibilityLabel="변경사항을 버릴까요?"
      onDismiss={Platform.OS === 'web' ? () => returnFocusRef?.current?.focus() : undefined}
      onRequestClose={onContinue}
      role="dialog"
      visible={visible}
    >
      <View
        style={[
          styles.surface,
          { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
        ]}
      >
        <View style={styles.copy}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.foregroundPrimary }]}
          >
            변경사항을 버릴까요?
          </Text>
          <Text style={[styles.description, { color: theme.foregroundSecondary }]}>
            저장하지 않은 변경사항이 사라져요.
          </Text>
        </View>
        <View style={styles.actions}>
          <Button onPress={onContinue} style={styles.action} tone="secondary">
            계속 편집
          </Button>
          <Button onPress={onDiscard} style={styles.action} tone="danger">
            버리기
          </Button>
        </View>
      </View>
    </ModalOverlay>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.xl,
    maxWidth: 420,
    padding: spacing.lg,
    width: '100%',
  },
  copy: { gap: spacing.sm },
  title: { fontFamily: fontFamilies.ui, fontWeight: '800', ...typography.lg },
  description: { fontFamily: fontFamilies.ui, ...typography.sm },
  actions: { ...layoutRecipes.dialogActions },
  action: { flex: 1, minWidth: 0 },
});
