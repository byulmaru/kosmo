import { createContext, useContext, useMemo } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { TabReselectionDestination, TabReselectionHandler } from './tabReselection';

export type { TabReselectionDestination, TabReselectionHandler } from './tabReselection';

export type HomeReselectionHandler = () => void;

type ShellChromeActions = {
  navigationDrawerOpen: boolean;
  navigationDrawerTriggerRef?: RefObject<NativeView | null>;
  openNavigationDrawer: () => void;
  openProfileSwitcher: () => void;
  registerHomeReselection: (handler: HomeReselectionHandler) => () => void;
  registerTabReselection?: (
    destination: TabReselectionDestination,
    handler: TabReselectionHandler,
  ) => () => void;
  reselectTab?: (destination: TabReselectionDestination) => void;
  reselectHome: HomeReselectionHandler;
};

type ShellChromeProviderProps = PropsWithChildren<ShellChromeActions>;

type ShellChromeActionContextValue = Pick<
  ShellChromeActions,
  | 'openNavigationDrawer'
  | 'openProfileSwitcher'
  | 'registerHomeReselection'
  | 'registerTabReselection'
  | 'reselectTab'
  | 'reselectHome'
>;

const ShellChromeContext = createContext<ShellChromeActions | null>(null);
const ShellChromeActionContext = createContext<ShellChromeActionContextValue | null>(null);

export function ShellChromeProvider({
  children,
  navigationDrawerOpen,
  navigationDrawerTriggerRef,
  openNavigationDrawer,
  openProfileSwitcher,
  registerHomeReselection,
  registerTabReselection,
  reselectTab,
  reselectHome,
}: ShellChromeProviderProps) {
  const value = useMemo<ShellChromeActions>(
    () => ({
      navigationDrawerOpen,
      navigationDrawerTriggerRef,
      openNavigationDrawer,
      openProfileSwitcher,
      registerHomeReselection,
      registerTabReselection,
      reselectTab,
      reselectHome,
    }),
    [
      navigationDrawerOpen,
      navigationDrawerTriggerRef,
      openNavigationDrawer,
      openProfileSwitcher,
      registerHomeReselection,
      registerTabReselection,
      reselectTab,
      reselectHome,
    ],
  );
  const actionValue = useMemo<ShellChromeActionContextValue>(
    () => ({
      openNavigationDrawer,
      openProfileSwitcher,
      registerHomeReselection,
      registerTabReselection,
      reselectTab,
      reselectHome,
    }),
    [
      openNavigationDrawer,
      openProfileSwitcher,
      registerHomeReselection,
      registerTabReselection,
      reselectTab,
      reselectHome,
    ],
  );
  return (
    <ShellChromeContext.Provider value={value}>
      <ShellChromeActionContext.Provider value={actionValue}>
        {children}
      </ShellChromeActionContext.Provider>
    </ShellChromeContext.Provider>
  );
}

export function useShellChromeActions(): ShellChromeActionContextValue | null {
  return useContext(ShellChromeActionContext);
}

export function useShellChrome() {
  return useContext(ShellChromeContext);
}
