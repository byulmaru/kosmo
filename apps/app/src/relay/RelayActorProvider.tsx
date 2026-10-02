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
  resetSession: () => void;
  selectedProfileId: string | null;
  setNativeSession: (token: string) => Promise<void>;
};

const RelayActorContext = createContext<RelayActorValue | null>(null);
const RelayActorLifecycleContext = createContext<string | null>(null);
const RelayAuthLifecycleContext = createContext<string | null>(null);

export function RelayActorProvider({
  children,
  createEnvironment = createRelayEnvironment,
}: PropsWithChildren<{
  createEnvironment?: (token: string | null, selectedProfileId: string | null) => Environment;
}>) {
  const [nativeToken, setNativeToken] = useState<string | null | undefined>(
    Platform.OS === 'web' ? null : undefined,
  );
  const [actor, dispatchActor] = useReducer(reduceActorState, initialActorState);
  const environmentGenerationRef = useRef(0);
  const authLifecycleGenerationRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    void readSessionToken().then(setNativeToken, () => setNativeToken(null));
  }, []);

  const resetActor = useCallback((profileId?: string | null) => {
    environmentGenerationRef.current += 1;
    dispatchActor({ type: 'profile-selected', profileId });
  }, []);

  const resetSession = useCallback(() => {
    authLifecycleGenerationRef.current += 1;
    resetActor(null);
  }, [resetActor]);

  const setNativeSession = useCallback(
    async (token: string) => {
      await writeSessionToken(token);
      resetSession();
      setNativeToken(token);
    },
    [resetSession],
  );

  const clearNativeSession = useCallback(async () => {
    await deleteSessionToken();
    resetSession();
    setNativeToken(null);
  }, [resetSession]);

  const environment = useMemo(
    () => createEnvironment(nativeToken ?? null, actor.id === 'session' ? null : actor.id),
    // Actor state identity intentionally invalidates selected-profile-scoped cached fields. Route
    // retries are owned by RouteBoundary and must not replace this Environment or Store.
    [actor, createEnvironment, nativeToken],
  );
  const value = useMemo(
    () => ({
      clearNativeSession,
      nativeToken: nativeToken ?? null,
      resetActor,
      resetSession,
      selectedProfileId: actor.id === 'session' ? null : actor.id,
      setNativeSession,
    }),
    [actor.id, clearNativeSession, nativeToken, resetActor, resetSession, setNativeSession],
  );

  if (nativeToken === undefined) {
    return <Splash label="세션을 복원하는 중입니다." />;
  }

  // This value is intentionally private and opaque to routes. It changes only when the actor or
  // authentication lifecycle changes, while the route-level fetch key remains independent.
  const actorLifecycleKey = `${actor.id}:${environmentGenerationRef.current}`;
  const authLifecycleKey = `auth:${authLifecycleGenerationRef.current}`;

  return (
    <RelayActorContext.Provider value={value}>
      <RelayActorLifecycleContext.Provider value={actorLifecycleKey}>
        <RelayAuthLifecycleContext.Provider value={authLifecycleKey}>
          <RelayEnvironmentBoundary
            environment={environment}
            generationRef={environmentGenerationRef}
          >
            {children}
          </RelayEnvironmentBoundary>
        </RelayAuthLifecycleContext.Provider>
      </RelayActorLifecycleContext.Provider>
    </RelayActorContext.Provider>
  );
}

/**
 * Remounts an actor-dependent subtree without remounting app-level providers such as navigation,
 * theme, or toast state.
 */
export function RelayActorBoundary({ children }: PropsWithChildren) {
  const actorLifecycleKey = useRelayActorLifecycleKey();

  return <RelayActorBoundaryContent key={actorLifecycleKey}>{children}</RelayActorBoundaryContent>;
}

/**
 * Returns an opaque identity for infrastructure boundaries that need to distinguish actor
 * lifecycles. Route components should use their nearest RouteBoundary instead.
 */
export function useRelayActorLifecycleKey(): string {
  const actorLifecycleKey = useContext(RelayActorLifecycleContext);

  if (!actorLifecycleKey) {
    throw new Error('useRelayActorLifecycleKey must be used inside RelayActorProvider.');
  }

  return actorLifecycleKey;
}

/**
 * Returns an opaque identity that changes only when the authentication session changes.
 */
export function useRelayAuthLifecycleKey(): string {
  const authLifecycleKey = useContext(RelayAuthLifecycleContext);

  if (!authLifecycleKey) {
    throw new Error('useRelayAuthLifecycleKey must be used inside RelayActorProvider.');
  }

  return authLifecycleKey;
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
