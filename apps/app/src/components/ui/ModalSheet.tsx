import { XIcon } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { IconButton } from './IconButton';
import { ModalOverlay } from './ModalOverlay';
import type { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  onClose: () => void;
  dismissDisabled?: boolean;
  onShow?: () => void;
  onDismiss?: () => void;
  role?: 'dialog' | 'alertdialog';
  title: string;
  visible: boolean;
}>;

export function ModalSheet({
  children,
  dismissDisabled = false,
  onClose,
  onShow,
  onDismiss,
  role = 'dialog',
  title,
  visible,
}: Props) {
  const theme = useTheme();
  const elevation = useElevation();
  const close = () => {
    if (visible && !dismissDisabled) {
      onClose();
    }
  };

  return (
    <ModalOverlay
      accessibilityLabel={title}
      backdropAccessibilityLabel={`${title} 닫기`}
      dismissDisabled={dismissDisabled}
      onRequestClose={onClose}
      onShow={onShow}
      onDismiss={onDismiss}
      presentation="dialog"
      role={Platform.OS === 'web' ? role : 'dialog'}
      visible={visible}
    >
      <Pressable
        accessibilityLabel={title}
        accessibilityViewIsModal={Platform.OS !== 'web'}
        onAccessibilityEscape={close}
        onPress={(event) => event.stopPropagation()}
        role={Platform.OS === 'web' ? undefined : 'dialog'}
        style={[
          styles.surface,
          elevation.overlay,
          { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
        ]}
      >
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.foregroundPrimary }]}
          >
            {title}
          </Text>
          <IconButton
            accessibilityLabel="닫기"
            disabled={!visible || dismissDisabled}
            onPress={close}
            style={styles.close}
            targetSize={44}
            visualSize={44}
          >
            <XIcon color={theme.foregroundPrimary} size={iconSizes[20]} />
          </IconButton>
        </View>
        {children}
      </Pressable>
    </ModalOverlay>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: radius[16],
    borderWidth: borderWidths[1],
    gap: space[12],
    padding: space[16],
    width: '100%',
  },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: textStyles.uiHeadingS,
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
});
