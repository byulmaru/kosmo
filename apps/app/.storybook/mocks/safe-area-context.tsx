import type { PropsWithChildren } from 'react';

export function SafeAreaProvider({ children }: PropsWithChildren) {
  return children;
}

export const useSafeAreaInsets = () => ({ bottom: 0, left: 0, right: 0, top: 0 });
