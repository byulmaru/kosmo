import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { deleteSessionToken, readSessionToken, writeSessionToken } from '@/auth/tokenStorage';
import { Splash } from '@/components/Splash';
import { initialActorState, reduceActorState } from './actorState';
import { createRelayEnvironment } from './environment';
import { RelayEnvironmentBoundary } from './RelayEnvironmentBoundary';
import type { PropsWithChildren } from 'react';
import type { Environment } from 'relay-runtime';

type RelayActorValue = {
  clearNativeSession: () => Promise<void>;
  nativeToken: string | null;
  resetActor: (profileId?: string | null) => void;
  setNativeSession: (token: string) => Promise<void>;
};

const RelayActorContext = createContext<RelayActorValue | null>(null);

export function RelayActorProvider({
  children,
  createEnvironment = createRelayEnvironment,
}: PropsWithChildren<{
  createEnvironment?: (token: string | null) => Environment;
}>) {
  const [nativeToken, setNativeToken] = useState<string | null | undefined>(
    Platform.OS === 'web' ? null : undefined,
  );
  const [actor, dispatchActor] = useReducer(reduceActorState, initialActorState);
  const environmentGenerationRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    void readSessionToken().then(setNativeToken, () => setNativeToken(null));
  }, []);

  const setNativeSession = useCallback(async (token: string) => {
    await writeSessionToken(token);
    environmentGenerationRef.current += 1;
    setNativeToken(token);
  }, []);

  const clearNativeSession = useCallback(async () => {
    await deleteSessionToken();
    environmentGenerationRef.current += 1;
    setNativeToken(null);
    dispatchActor({ type: 'profile-selected', profileId: null });
  }, []);

  const resetActor = useCallback((profileId?: string | null) => {
    environmentGenerationRef.current += 1;
    dispatchActor({ type: 'profile-selected', profileId });
  }, []);

  const environment = useMemo(
    () => createEnvironment(nativeToken ?? null),
    // Every actor lifecycle action receives a fresh state object, even when the selected ID is
    // unchanged. That keeps resetActor an explicit Store reset without exposing a public counter.
    [actor, createEnvironment, nativeToken],
  );
  const value = useMemo(
    () => ({
      clearNativeSession,
      nativeToken: nativeToken ?? null,
      resetActor,
      setNativeSession,
    }),
    [clearNativeSession, nativeToken, resetActor, setNativeSession],
  );

  if (nativeToken === undefined) {
    return <Splash label="세션을 복원하는 중입니다." />;
  }

  return (
    <RelayActorContext.Provider value={value}>
      <RelayEnvironmentBoundary
        // Keep the actor-dependent tree isolated while leaving Theme/Toast and other app-level
        // providers outside this boundary. The generation is intentionally private to this
        // provider; routes do not need to construct lifecycle keys themselves.
        key={`${actor.id}:${environmentGenerationRef.current}`}
        environment={environment}
        generationRef={environmentGenerationRef}
      >
        {children}
      </RelayEnvironmentBoundary>
    </RelayActorContext.Provider>
  );
}

export function useRelayActor(): RelayActorValue {
  const value = useContext(RelayActorContext);

  if (!value) {
    throw new Error('useRelayActor must be used inside RelayActorProvider.');
  }

  return value;
}
