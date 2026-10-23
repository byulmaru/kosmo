import { createContext, useContext, useMemo } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { TabReselectionDestination, TabReselectionHandler } from './tabReselection';

export type { TabReselectionDestination, TabReselectionHandler } from './tabReselection';

export type HomeReselectionHandler = () => void;

type ShellChromeActions = {
  closeNavigationDrawer?: () => void;
  navigationDrawerOpen: boolean;
  navigationDrawerTriggerRef?: RefObject<NativeView | null>;
  openNavigationDrawer: () => void;
  openProfileSwitcher: () => void;
  registerTimelineHelp?: (handler: (() => void) | null) => () => void;
  timelineComposerRef?: RefObject<NativeView | null>;
  timelineHelp?: () => void;
  timelineHelpTriggerRef?: RefObject<NativeView | null>;
  timelineProfileRef?: RefObject<NativeView | null>;
  registerHomeReselection: (handler: HomeReselectionHandler) => () => void;
  registerTabReselection?: (
    destination: TabReselectionDestination,
    handler: TabReselectionHandler,
  ) => () => void;
  reselectTab?: (destination: TabReselectionDestination) => void;
  reselectHome: HomeReselectionHandler;
};

type ShellChromeProviderProps = PropsWithChildren<ShellChromeActions>;

const ShellChromeContext = createContext<ShellChromeActions | null>(null);

export function ShellChromeProvider({
  children,
  closeNavigationDrawer,
  navigationDrawerOpen,
  navigationDrawerTriggerRef,
  openNavigationDrawer,
  openProfileSwitcher,
  registerTimelineHelp,
  timelineComposerRef,
  timelineHelp,
  timelineHelpTriggerRef,
  timelineProfileRef,
  registerHomeReselection,
  registerTabReselection,
  reselectTab,
  reselectHome,
}: ShellChromeProviderProps) {
  const value = useMemo(
    () => ({
      closeNavigationDrawer,
      navigationDrawerOpen,
      navigationDrawerTriggerRef,
      openNavigationDrawer,
      openProfileSwitcher,
      registerTimelineHelp,
      timelineComposerRef,
      timelineHelp,
      timelineHelpTriggerRef,
      timelineProfileRef,
      registerHomeReselection,
      registerTabReselection,
      reselectTab,
      reselectHome,
    }),
    [
      navigationDrawerOpen,
      navigationDrawerTriggerRef,
      closeNavigationDrawer,
      openNavigationDrawer,
      openProfileSwitcher,
      registerTimelineHelp,
      timelineComposerRef,
      timelineHelp,
      timelineHelpTriggerRef,
      timelineProfileRef,
      registerHomeReselection,
      registerTabReselection,
      reselectTab,
      reselectHome,
    ],
  );
  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}

export function useShellChrome() {
  return useContext(ShellChromeContext);
}
