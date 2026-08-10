import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

type SessionRecoveryCoordinatorValue = {
  generation: number;
  recoverSession: () => void;
};

const SessionRecoveryCoordinatorContext = createContext<SessionRecoveryCoordinatorValue | null>(
  null,
);

export function SessionRecoveryProvider({ children }: PropsWithChildren) {
  const [generation, setGeneration] = useState(0);
  const recoverSession = useCallback(() => setGeneration((current) => current + 1), []);
  const value = useMemo(() => ({ generation, recoverSession }), [generation, recoverSession]);

  return (
    <SessionRecoveryCoordinatorContext.Provider value={value}>
      {children}
    </SessionRecoveryCoordinatorContext.Provider>
  );
}

export function useSessionRecovery(): () => void {
  return useSessionRecoveryCoordinator().recoverSession;
}

export function useSessionRecoveryGeneration(): number {
  return useSessionRecoveryCoordinator().generation;
}

function useSessionRecoveryCoordinator(): SessionRecoveryCoordinatorValue {
  const value = useContext(SessionRecoveryCoordinatorContext);

  if (!value) {
    throw new Error('SessionRecoveryProvider is required.');
  }

  return value;
}
