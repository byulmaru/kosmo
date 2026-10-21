import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';

type OverlayPortalProviderProps = Readonly<{
  children: ReactNode;
  hostRef: RefObject<View | null>;
}>;

export function OverlayPortal({ children }: { children: ReactNode }): ReactNode {
  return children;
}

export function OverlayPortalProvider({ children }: OverlayPortalProviderProps): ReactNode {
  return children;
}
