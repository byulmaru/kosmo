import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';

type ShellChromeActions = {
  navigationDrawerOpen: boolean;
  openNavigationDrawer: () => void;
  openProfileSwitcher: () => void;
};

const ShellChromeContext = createContext<ShellChromeActions | null>(null);

export function ShellChromeProvider({
  children,
  navigationDrawerOpen,
  openNavigationDrawer,
  openProfileSwitcher,
}: PropsWithChildren<ShellChromeActions>) {
  return (
    <ShellChromeContext.Provider
      value={{ navigationDrawerOpen, openNavigationDrawer, openProfileSwitcher }}
    >
      {children}
    </ShellChromeContext.Provider>
  );
}

export function useShellChrome() {
  return useContext(ShellChromeContext);
}
