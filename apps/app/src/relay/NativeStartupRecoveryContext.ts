import { createContext, useContext } from 'react';
import type { NativeStartupRecovery } from './nativeStartupRecovery';

type StartupLifecycle = Pick<NativeStartupRecovery, 'complete' | 'sessionReady'>;

export const NativeStartupRecoveryContext = createContext<StartupLifecycle | null>(null);

export function useNativeStartupRecovery(): StartupLifecycle | null {
  return useContext(NativeStartupRecoveryContext);
}
