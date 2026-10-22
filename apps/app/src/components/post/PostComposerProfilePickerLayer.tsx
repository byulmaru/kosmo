import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { spacing } from '@/theme/tokens';
import type { ReactNode, RefObject } from 'react';
import type { View as NativeView } from 'react-native';

export type PostComposerProfilePickerLayerProps = {
  children: (maxHeight: number) => ReactNode;
  onDismiss: () => void;
  pickerRef: RefObject<NativeView | null>;
  onRequestClose: () => void;
  open: boolean;
  triggerRef: RefObject<NativeView | null>;
};

export function PostComposerProfilePickerLayer({
  children,
  onDismiss,
  onRequestClose,
  open,
}: PostComposerProfilePickerLayerProps) {
  const [height, setHeight] = useState(0);
  const viewport = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <ModalOverlay
      accessibilityLabel="작성 프로필 선택"
      onDismiss={onDismiss}
      onRequestClose={onRequestClose}
      visible={open}
    >
      <KeyboardAvoidingView
        behavior="height"
        style={{
          height: Math.max(0, viewport.height - insets.top - insets.bottom - spacing.md * 2),
        }}
      >
        <View
          onAccessibilityEscape={onRequestClose}
          onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
          style={styles.bounds}
        >
          {height > 0 ? (
            <View testID="post-composer-profile-picker">
              {children(Math.max(0, height - spacing.sm * 2))}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </ModalOverlay>
  );
}

const styles = StyleSheet.create({
  bounds: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
});
