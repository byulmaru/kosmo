import { XIcon } from 'lucide-react-native';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { useOverlayMotion } from '@/theme/useOverlayMotion';
import { IconButton } from './IconButton';
import type { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  onClose: () => void;
  dismissDisabled?: boolean;
  onShow?: () => void;
  onDismiss?: () => void;
  title: string;
  visible: boolean;
}>;

export function ModalSheet({
  children,
  dismissDisabled = false,
  onClose,
  onShow,
  onDismiss,
  title,
  visible,
}: Props) {
  const theme = useTheme();
  const elevation = useElevation();
  const overlayMotion = useOverlayMotion(visible);

  return (
    <Modal
      accessibilityLabel={title}
      animationType="none"
      onRequestClose={() => {
        if (!dismissDisabled) {
          onClose();
        }
      }}
      onShow={onShow}
      onDismiss={onDismiss}
      role="dialog"
      transparent
      visible={overlayMotion.mounted}
    >
      <View style={styles.backdrop}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.overlayScrim, opacity: overlayMotion.progress },
          ]}
        />
        <Pressable
          accessibilityLabel={`${title} 닫기`}
          accessibilityRole="button"
          disabled={dismissDisabled}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[
            styles.motionSurface,
            {
              opacity: overlayMotion.progress,
              transform: [
                {
                  translateY: overlayMotion.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
                {
                  scale: overlayMotion.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.98, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            accessibilityLabel={title}
            accessibilityViewIsModal
            onPress={(event) => event.stopPropagation()}
            role="dialog"
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
                disabled={dismissDisabled}
                onPress={onClose}
                style={styles.close}
                targetSize={44}
                visualSize={44}
              >
                <XIcon color={theme.foregroundPrimary} size={iconSizes[20]} />
              </IconButton>
            </View>
            {children}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: space[16],
  },
  motionSurface: { maxWidth: 420, width: '100%' },
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
