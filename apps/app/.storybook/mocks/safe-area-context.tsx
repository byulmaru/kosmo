import { View } from 'react-native';
import type { PropsWithChildren } from 'react';
import type { ViewProps } from 'react-native';

export function SafeAreaProvider({ children }: PropsWithChildren) {
  return children;
}

export function SafeAreaView({ children, ...props }: PropsWithChildren<ViewProps>) {
  return <View {...props}>{children}</View>;
}

export const useSafeAreaInsets = () => ({ bottom: 0, left: 0, right: 0, top: 0 });
