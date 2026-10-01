import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type SettingsDetailHeaderMode = 'back' | 'hidden' | 'plain';

const SettingsRouteContext = createContext<{
  detailHeaderMode: SettingsDetailHeaderMode;
} | null>(null);

export function SettingsRouteProvider({
  children,
  detailHeaderMode,
}: {
  children: ReactNode;
  detailHeaderMode: SettingsDetailHeaderMode;
}) {
  return (
    <SettingsRouteContext.Provider value={{ detailHeaderMode }}>
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
