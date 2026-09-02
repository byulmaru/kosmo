import { Modal, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { ReactNode } from 'react';

type ComposerOverlayFixtureProps = Readonly<{
  accessibilityLabel: string;
  children: ReactNode;
  maxWidth: number;
  onRequestClose: () => void;
  visible: boolean;
}>;

export function ComposerOverlayFixture({
  accessibilityLabel,
  children,
  maxWidth,
  onRequestClose,
  visible,
}: ComposerOverlayFixtureProps) {
  const theme = useTheme();

  return (
    <Modal
      accessibilityLabel={accessibilityLabel}
      accessibilityViewIsModal
      animationType="none"
      onRequestClose={onRequestClose}
      role="dialog"
      transparent
      visible={visible}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.overlayScrim }]}>
        <View
          accessibilityViewIsModal
          style={[styles.surface, { backgroundColor: theme.backgroundSurface, maxWidth }]}
        >
          {children}
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
    padding: space[24],
    width: '100vw' as never,
  },
  surface: {
    borderRadius: radius[16],
    maxHeight: '85dvh' as never,
    overflow: 'hidden',
    width: '100%',
  },
});
