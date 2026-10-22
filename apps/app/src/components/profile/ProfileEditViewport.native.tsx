import { useFrameSize, useHeaderHeight } from 'expo-router/react-navigation';
import { View } from 'react-native';
import type { ReactNode } from 'react';

export function ProfileEditViewport({ children }: { children: ReactNode }) {
  const frameHeight = useFrameSize((frame) => frame.height);
  const headerHeight = useHeaderHeight();

  // The navigator frame already excludes shell chrome; its custom header is still inside it.
  return <View style={{ height: Math.max(0, frameHeight - headerHeight) }}>{children}</View>;
}
