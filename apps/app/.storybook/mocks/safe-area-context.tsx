import { createContext, useContext } from 'react';
import { View } from 'react-native';
import type { PropsWithChildren } from 'react';
import type { ViewProps } from 'react-native';

type MockSafeAreaInsets = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

type SafeAreaProviderProps = PropsWithChildren<{
  initialSafeAreaInsets?: MockSafeAreaInsets;
}>;

const zeroInsets: MockSafeAreaInsets = { bottom: 0, left: 0, right: 0, top: 0 };
const SafeAreaInsetsContext = createContext<MockSafeAreaInsets>(zeroInsets);

export function SafeAreaProvider({ children, initialSafeAreaInsets }: SafeAreaProviderProps) {
  const insets = initialSafeAreaInsets ?? zeroInsets;

  return <SafeAreaInsetsContext.Provider value={insets}>{children}</SafeAreaInsetsContext.Provider>;
}

export function SafeAreaView({ children, ...props }: PropsWithChildren<ViewProps>) {
  return <View {...props}>{children}</View>;
}

export const useSafeAreaInsets = () => useContext(SafeAreaInsetsContext);
