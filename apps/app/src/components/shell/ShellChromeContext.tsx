import { createContext, useContext } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { BottomTabBar_profile$key } from './__generated__/BottomTabBar_profile.graphql';
import type {
  NativeTabReselectionDestination,
  NativeTabReselectionHandler,
} from './nativeTabNavigation';

export type {
  NativeTabReselectionDestination,
  NativeTabReselectionHandler,
} from './nativeTabNavigation';

export type HomeReselectionHandler = () => void;

type ShellChromeActions = {
  navigationDrawerOpen: boolean;
  navigationDrawerTriggerRef?: RefObject<NativeView | null>;
  openComposer?: () => void;
  openNavigationDrawer: () => void;
  openProfileSwitcher: () => void;
  registerHomeReselection: (handler: HomeReselectionHandler) => () => void;
  registerNativeTabReselection?: (
    destination: NativeTabReselectionDestination,
    handler: NativeTabReselectionHandler,
  ) => () => void;
  reselectNativeTab?: (destination: NativeTabReselectionDestination) => void;
  reselectHome: HomeReselectionHandler;
  selectedProfile?: BottomTabBar_profile$key | null;
};

type ShellChromeProviderProps = PropsWithChildren<ShellChromeActions>;

const ShellChromeContext = createContext<ShellChromeActions | null>(null);

export function ShellChromeProvider({
  children,
  navigationDrawerOpen,
  navigationDrawerTriggerRef,
  openComposer,
  openNavigationDrawer,
  openProfileSwitcher,
  registerHomeReselection,
  registerNativeTabReselection,
  reselectNativeTab,
  reselectHome,
  selectedProfile,
}: ShellChromeProviderProps) {
  return (
    <ShellChromeContext.Provider
      value={{
        navigationDrawerOpen,
        navigationDrawerTriggerRef,
        openComposer,
        openNavigationDrawer,
        openProfileSwitcher,
        registerHomeReselection,
        registerNativeTabReselection,
        reselectNativeTab,
        reselectHome,
        selectedProfile,
      }}
    >
      {children}
    </ShellChromeContext.Provider>
  );
}

export function useShellChrome() {
  return useContext(ShellChromeContext);
}
