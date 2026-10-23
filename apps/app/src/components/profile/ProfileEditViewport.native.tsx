import { useFrameSize, useHeaderHeight } from 'expo-router/react-navigation';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import type { ReactNode } from 'react';

export function ProfileEditViewport({ children }: { children: ReactNode }) {
  const frameHeight = useFrameSize((frame) => frame.height);
  const headerHeight = useHeaderHeight();

  // The navigator frame already excludes shell chrome; its custom header is still inside it.
  const style = { height: Math.max(0, frameHeight - headerHeight) };

  return Platform.OS === 'android' ? (
    <KeyboardAvoidingView behavior="padding" style={style}>
      {children}
    </KeyboardAvoidingView>
  ) : (
    <View style={style}>{children}</View>
  );
}
