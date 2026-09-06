import { createContext, useContext } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import type { View as NativeView } from 'react-native';

export type HomeReselectionHandler = () => void;
export type TimelineRefreshHandler = () => void;

type ShellChromeActions = {
  navigationDrawerOpen: boolean;
  navigationDrawerTriggerRef?: RefObject<NativeView | null>;
  openNavigationDrawer: () => void;
  openProfileSwitcher: () => void;
  registerHomeRefresh?: (handler: TimelineRefreshHandler) => () => void;
  registerHomeReselection: (handler: HomeReselectionHandler) => () => void;
  registerLocalRefresh?: (handler: TimelineRefreshHandler) => () => void;
  refreshProfileMuteTimelines?: TimelineRefreshHandler;
  reselectHome: HomeReselectionHandler;
};

type ShellChromeProviderProps = PropsWithChildren<ShellChromeActions>;

const ShellChromeContext = createContext<ShellChromeActions | null>(null);

export function ShellChromeProvider({
  children,
  navigationDrawerOpen,
  navigationDrawerTriggerRef,
  openNavigationDrawer,
  openProfileSwitcher,
  registerHomeRefresh,
  registerHomeReselection,
  registerLocalRefresh,
  refreshProfileMuteTimelines,
  reselectHome,
}: ShellChromeProviderProps) {
  return (
    <ShellChromeContext.Provider
      value={{
        navigationDrawerOpen,
        navigationDrawerTriggerRef,
        openNavigationDrawer,
        openProfileSwitcher,
        registerHomeRefresh,
        registerHomeReselection,
        registerLocalRefresh,
        refreshProfileMuteTimelines,
        reselectHome,
      }}
    >
      {children}
    </ShellChromeContext.Provider>
  );
}

export function useShellChrome() {
  return useContext(ShellChromeContext);
}
