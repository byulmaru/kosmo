import { Modal, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes, radii, spacing, typography } from '@/theme/tokens';
import { Button } from '../ui/Button';

type ProfileEditDiscardDialogProps = {
  onContinue: () => void;
  onDiscard: () => void;
  visible: boolean;
};

export function ProfileEditDiscardDialog({
  onContinue,
  onDiscard,
  visible,
}: ProfileEditDiscardDialogProps) {
  const theme = useTheme();

  return (
    <Modal
      accessibilityLabel="변경사항을 버릴까요?"
      animationType="fade"
      onRequestClose={onContinue}
      role="dialog"
      transparent
      visible={visible}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.overlayScrim }]}>
        <View style={[styles.surface, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.copy}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              변경사항을 버릴까요?
            </Text>
            <Text style={[styles.description, { color: theme.textSecondary }]}>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  surface: {
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.xl,
    maxWidth: 420,
    padding: spacing.lg,
    width: '100%',
  },
  copy: { gap: spacing.sm },
  title: { fontFamily: 'SUIT', fontWeight: '800', ...typography.lg },
  description: { fontFamily: 'SUIT', ...typography.sm },
  actions: { ...layoutRecipes.dialogActions },
  action: { flex: 1, minWidth: 0 },
});
