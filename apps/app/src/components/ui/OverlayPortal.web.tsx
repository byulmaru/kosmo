import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';

const OverlayPortalHostContext = createContext<RefObject<View | null> | null>(null);

export function OverlayPortal({ children }: { children: ReactNode }): ReactNode {
  const hostRef = useContext(OverlayPortalHostContext);
  const host = hostRef?.current as unknown as HTMLElement | null;
  return createPortal(children, host ?? document.body);
}

export function OverlayPortalProvider({
  children,
  hostRef,
}: {
  children: ReactNode;
  hostRef: RefObject<View | null>;
}): ReactNode {
  return (
    <OverlayPortalHostContext.Provider value={hostRef}>
      {children}
    </OverlayPortalHostContext.Provider>
  );
}
