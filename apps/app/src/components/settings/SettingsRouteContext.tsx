import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { SettingsNavigationState } from './settingsNavigation';

export type SettingsDetailHeaderMode = 'back' | 'hidden' | 'plain';

const SettingsRouteContext = createContext<{
  detailHeaderMode: SettingsDetailHeaderMode;
  navigationState: SettingsNavigationState | null;
} | null>(null);

export function SettingsRouteProvider({
  children,
  detailHeaderMode,
  navigationState,
}: {
  children: ReactNode;
  detailHeaderMode: SettingsDetailHeaderMode;
  navigationState?: SettingsNavigationState | null;
}) {
  return (
    <SettingsRouteContext.Provider
      value={{ detailHeaderMode, navigationState: navigationState ?? null }}
    >
      {children}
    </SettingsRouteContext.Provider>
  );
}

export function useSettingsDetailHeaderMode() {
  const context = useContext(SettingsRouteContext);

  if (!context) {
    throw new Error('Settings detail routes must render inside the Settings route layout.');
  }

  return context.detailHeaderMode;
}

export function useSettingsNavigationState() {
  const context = useContext(SettingsRouteContext);

  if (!context) {
    throw new Error('Settings detail routes must render inside the Settings route layout.');
  }

  return context.navigationState;
}
