import { createContext, useContext } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type {
  NativeTabReselectionDestination,
  NativeTabReselectionHandler,
} from './nativeTabReselection';

export type {
  NativeTabReselectionDestination,
  NativeTabReselectionHandler,
} from './nativeTabReselection';

export type HomeReselectionHandler = () => void;

type ShellChromeActions = {
  navigationDrawerOpen: boolean;
  navigationDrawerTriggerRef?: RefObject<NativeView | null>;
  openNavigationDrawer: () => void;
  openProfileSwitcher: () => void;
  registerHomeReselection: (handler: HomeReselectionHandler) => () => void;
  registerNativeTabReselection?: (
    destination: NativeTabReselectionDestination,
    handler: NativeTabReselectionHandler,
  ) => () => void;
  reselectNativeTab?: (destination: NativeTabReselectionDestination) => void;
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
  registerHomeReselection,
  registerNativeTabReselection,
  reselectNativeTab,
  reselectHome,
}: ShellChromeProviderProps) {
  return (
    <ShellChromeContext.Provider
      value={{
        navigationDrawerOpen,
        navigationDrawerTriggerRef,
        openNavigationDrawer,
        openProfileSwitcher,
        registerHomeReselection,
        registerNativeTabReselection,
        reselectNativeTab,
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
