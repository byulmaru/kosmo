import { createContext, useContext, useMemo } from 'react';
import type { PropsWithChildren, RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { SettingsNavigationList_profile$key } from '@/components/settings/__generated__/SettingsNavigationList_profile.graphql';
import type { TabReselectionDestination, TabReselectionHandler } from './tabReselection';

export type { TabReselectionDestination, TabReselectionHandler } from './tabReselection';

export type HomeReselectionHandler = () => void;

type ShellChromeActions = {
  navigationDrawerOpen: boolean;
  navigationDrawerTriggerRef?: RefObject<NativeView | null>;
  openComposer?: () => void;
  openNavigationDrawer: () => void;
  openProfileSwitcher: () => void;
  selectedProfile?: SettingsNavigationList_profile$key | null;
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
  navigationDrawerOpen,
  navigationDrawerTriggerRef,
  openComposer,
  openNavigationDrawer,
  openProfileSwitcher,
  selectedProfile = null,
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
      navigationDrawerOpen,
      navigationDrawerTriggerRef,
      openComposer,
      openNavigationDrawer,
      openProfileSwitcher,
      selectedProfile,
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
      openComposer,
      openNavigationDrawer,
      openProfileSwitcher,
      selectedProfile,
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
