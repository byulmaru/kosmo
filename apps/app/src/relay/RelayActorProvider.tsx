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
const RelayActorBoundaryContext = createContext<string | null>(null);

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

  const setNativeSession = useCallback(
    async (token: string) => {
      await writeSessionToken(token);
      environmentGenerationRef.current += 1;
      setNativeToken(token);
      // Keep the active actor ID while still creating a fresh actor state object. This preserves the
      // auth lifecycle reset even when the token value is unchanged and React bails out of setState.
      dispatchActor({ type: 'profile-selected', profileId: actor.id });
    },
    [actor.id],
  );

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

  const actorBoundaryKey = `${actor.id}:${environmentGenerationRef.current}`;

  return (
    <RelayActorContext.Provider value={value}>
      <RelayActorBoundaryContext.Provider value={actorBoundaryKey}>
        <RelayEnvironmentBoundary
          environment={environment}
          generationRef={environmentGenerationRef}
        >
          {children}
        </RelayEnvironmentBoundary>
      </RelayActorBoundaryContext.Provider>
    </RelayActorContext.Provider>
  );
}

/**
 * Remounts an actor-dependent subtree without remounting the app's navigation state.
 *
 * The root Relay environment provider remains stable while its environment changes; consumers
 * place this boundary below navigators (for example around the tabs Slot) when local actor state
 * must be recreated for a new Store.
 */
export function RelayActorBoundary({ children }: PropsWithChildren) {
  const actorBoundaryKey = useContext(RelayActorBoundaryContext);

  if (!actorBoundaryKey) {
    throw new Error('RelayActorBoundary must be used inside RelayActorProvider.');
  }

  return <RelayActorBoundaryContent key={actorBoundaryKey}>{children}</RelayActorBoundaryContent>;
}

/**
 * Returns the opaque actor lifecycle identity for infrastructure boundaries.
 *
 * Routes and general UI should use their nearest route boundary instead of constructing lifecycle
 * keys. RelayActorBoundary and session infrastructure are the intended consumers.
 */
export function useRelayActorLifecycleKey(): string {
  const actorLifecycleKey = useContext(RelayActorBoundaryContext);

  if (!actorLifecycleKey) {
    throw new Error('useRelayActorLifecycleKey must be used inside RelayActorProvider.');
  }

  return actorLifecycleKey;
}

function RelayActorBoundaryContent({ children }: PropsWithChildren) {
  return children;
}

export function useRelayActor(): RelayActorValue {
  const value = useContext(RelayActorContext);

  if (!value) {
    throw new Error('useRelayActor must be used inside RelayActorProvider.');
  }

  return value;
}
