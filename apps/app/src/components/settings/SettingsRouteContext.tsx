import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type SettingsDetailHeaderMode = 'back' | 'hidden' | 'plain';

const SettingsRouteContext = createContext<SettingsDetailHeaderMode | null>(null);

export function SettingsRouteProvider({
  children,
  detailHeaderMode,
}: {
  children: ReactNode;
  detailHeaderMode: SettingsDetailHeaderMode;
}) {
  return (
    <SettingsRouteContext.Provider value={detailHeaderMode}>
      {children}
    </SettingsRouteContext.Provider>
  );
}

export function useSettingsDetailHeaderMode() {
  const mode = useContext(SettingsRouteContext);

  if (!mode) {
    throw new Error('Settings detail routes must render inside the Settings route layout.');
  }

  return mode;
}
