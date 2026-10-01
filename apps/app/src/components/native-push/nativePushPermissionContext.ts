import { createContext, useContext } from 'react';

export const NativePushPermissionActionContext = createContext<(() => Promise<void>) | null>(null);

export function useRequestNativePushPermissionAndSync(): () => Promise<void> {
  const action = useContext(NativePushPermissionActionContext);
  if (!action) {
    throw new Error('Native push permission actions require NativePushProvider.');
  }

  return action;
}
