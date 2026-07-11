import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';

type ShellChromeActions = {
  openProfileSwitcher: () => void;
};

const ShellChromeContext = createContext<ShellChromeActions | null>(null);

export function ShellChromeProvider({
  children,
  openProfileSwitcher,
}: PropsWithChildren<ShellChromeActions>) {
  return (
    <ShellChromeContext.Provider value={{ openProfileSwitcher }}>
      {children}
    </ShellChromeContext.Provider>
  );
}

export function useShellChrome() {
  return useContext(ShellChromeContext);
}
