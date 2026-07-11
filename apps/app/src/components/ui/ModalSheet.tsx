import { XIcon } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  onClose: () => void;
  title: string;
  visible: boolean;
}>;

export function ModalSheet({ children, onClose, title, visible }: Props) {
  const theme = useTheme();

  return (
    <Modal
      accessibilityLabel={title}
      animationType="fade"
      onRequestClose={onClose}
      role="dialog"
      transparent
      visible={visible}
    >
      <Pressable accessibilityLabel={`${title} 닫기`} onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityLabel={title}
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          role="dialog"
          style={[styles.surface, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              {title}
            </Text>
            <Pressable accessibilityLabel="닫기" onPress={onClose} style={styles.close}>
              <XIcon color={theme.text} size={20} />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  surface: {
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    maxWidth: 420,
    padding: spacing.lg,
    width: '100%',
  },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontFamily: 'SUIT', fontWeight: '800', ...typography.lg },
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
});
