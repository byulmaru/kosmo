import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

type SessionRecoveryCoordinatorValue = {
  generation: number;
  recoverSession: () => void;
};

const SessionRecoveryContext = createContext<SessionRecoveryCoordinatorValue | null>(null);

/**
 * Owns explicit retries for the session query. Session recovery is intentionally separate from
 * the Relay actor lifecycle so a failed route can revalidate without discarding actor-scoped
 * normalized data.
 */
export function SessionRecoveryProvider({ children }: PropsWithChildren) {
  const [generation, setGeneration] = useState(0);
  const recoverSession = useCallback(() => setGeneration((current) => current + 1), []);
  const value = useMemo(() => ({ generation, recoverSession }), [generation, recoverSession]);

  return (
    <SessionRecoveryContext.Provider value={value}>{children}</SessionRecoveryContext.Provider>
  );
}

export function useSessionRecovery(): () => void {
  return useSessionRecoveryCoordinator().recoverSession;
}

export function useSessionRecoveryGeneration(): number {
  return useSessionRecoveryCoordinator().generation;
}

function useSessionRecoveryCoordinator(): SessionRecoveryCoordinatorValue {
  const value = useContext(SessionRecoveryContext);

  if (!value) {
    throw new Error('SessionRecoveryProvider is required.');
  }

  return value;
}
