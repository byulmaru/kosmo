import { createContext, useContext } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import type { View as NativeView } from 'react-native';

type ShellChromeActions = {
  navigationDrawerOpen: boolean;
  navigationDrawerTriggerRef?: RefObject<NativeView | null>;
  openNavigationDrawer: () => void;
  openProfileSwitcher: () => void;
};

const ShellChromeContext = createContext<ShellChromeActions | null>(null);

export function ShellChromeProvider({
  children,
  navigationDrawerOpen,
  navigationDrawerTriggerRef,
  openNavigationDrawer,
  openProfileSwitcher,
}: PropsWithChildren<ShellChromeActions>) {
  return (
    <ShellChromeContext.Provider
      value={{
        navigationDrawerOpen,
        navigationDrawerTriggerRef,
        openNavigationDrawer,
        openProfileSwitcher,
      }}
    >
      {children}
    </ShellChromeContext.Provider>
  );
}

export function useShellChrome() {
  return useContext(ShellChromeContext);
}
