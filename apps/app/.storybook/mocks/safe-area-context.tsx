import { createContext, useContext } from 'react';
import { View } from 'react-native';
import type { PropsWithChildren } from 'react';
import type { ViewProps } from 'react-native';

type Insets = { bottom: number; left: number; right: number; top: number };
type InitialMetrics = {
  frame: { height: number; width: number; x: number; y: number };
  insets: Insets;
};

const zeroInsets: Insets = { bottom: 0, left: 0, right: 0, top: 0 };
const InsetsContext = createContext(zeroInsets);

export function SafeAreaProvider({
  children,
  initialMetrics,
}: PropsWithChildren<{ initialMetrics?: InitialMetrics | null }>) {
  return (
    <InsetsContext.Provider value={initialMetrics?.insets ?? zeroInsets}>
      {children}
    </InsetsContext.Provider>
  );
}

export function SafeAreaView({ children, ...props }: PropsWithChildren<ViewProps>) {
  return <View {...props}>{children}</View>;
}

export const useSafeAreaInsets = () => useContext(InsetsContext);
