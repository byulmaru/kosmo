import { useCallback, useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { ModalSheetHost } from '@/components/ui/ModalSheetHost';
import { useOverlayMotion } from '@/theme/useOverlayMotion';
import type { ModalSheetHostProps } from '@/components/ui/ModalSheetHost';

export function PostComposerModalHost({
  children,
  closeRequestDisabled,
  interactionDisabled,
  onDismiss,
  onRequestClose,
  visible: visibleProp,
  ...modalProps
}: ModalSheetHostProps) {
  const android = Platform.OS === 'android';
  const visible = visibleProp ?? true;
  const overlayMotion = useOverlayMotion(android && visible);
  const mounted = android ? overlayMotion.mounted : visible;
  const wasMounted = useRef(mounted);

  useEffect(() => {
    // Android Modal has no onDismiss; report its completed exit at the end of presence.
    if (android && wasMounted.current && !mounted) {
      onDismiss?.();
    }
    wasMounted.current = mounted;
  }, [android, mounted, onDismiss]);

  const handleRequestClose = useCallback(() => {
    if (visible && !interactionDisabled && !closeRequestDisabled) {
      onRequestClose?.();
    }
  }, [closeRequestDisabled, interactionDisabled, onRequestClose, visible]);
  const inert = !visible || interactionDisabled;
  const contentProps = {
    accessibilityElementsHidden: inert,
    importantForAccessibility: inert ? 'no-hide-descendants' : 'auto',
    pointerEvents: inert ? 'none' : 'auto',
  } as const;
  const content = android ? (
    <Animated.View {...contentProps} style={[styles.fill, { opacity: overlayMotion.progress }]}>
      {children}
    </Animated.View>
  ) : (
    <View {...contentProps} style={styles.fill}>
      {children}
    </View>
  );

  return (
    <ModalSheetHost
      {...modalProps}
      animationType={android ? 'none' : 'fade'}
      interactionDisabled={inert}
      onDismiss={android ? undefined : onDismiss}
      onRequestClose={handleRequestClose}
      visible={mounted}
    >
      {content}
    </ModalSheetHost>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
