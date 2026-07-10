import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { RelayEnvironmentProvider } from 'react-relay';
import { deleteSessionToken, readSessionToken, writeSessionToken } from '@/auth/tokenStorage';
import { Splash } from '@/components/Splash';
import { initialActorState, reduceActorState } from './actorState';
import { createRelayEnvironment } from './environment';
import type { PropsWithChildren } from 'react';

type RelayActorValue = {
  clearNativeSession: () => Promise<void>;
  nativeToken: string | null;
  revision: number;
  resetActor: (profileId?: string | null) => void;
  retry: () => void;
  setNativeSession: (token: string) => Promise<void>;
};

const RelayActorContext = createContext<RelayActorValue | null>(null);

export function RelayActorProvider({ children }: PropsWithChildren) {
  const [nativeToken, setNativeToken] = useState<string | null | undefined>(
    Platform.OS === 'web' ? null : undefined,
  );
  const [actor, dispatchActor] = useReducer(reduceActorState, initialActorState);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    void readSessionToken().then(setNativeToken, () => setNativeToken(null));
  }, []);

  const setNativeSession = useCallback(async (token: string) => {
    await writeSessionToken(token);
    setNativeToken(token);
    dispatchActor({ type: 'retry' });
  }, []);

  const clearNativeSession = useCallback(async () => {
    await deleteSessionToken();
    setNativeToken(null);
    dispatchActor({ type: 'profile-selected', profileId: null });
  }, []);

  const resetActor = useCallback((profileId?: string | null) => {
    dispatchActor({ type: 'profile-selected', profileId });
  }, []);

  const retry = useCallback(() => {
    dispatchActor({ type: 'retry' });
  }, []);

  const environment = useMemo(
    () => createRelayEnvironment(nativeToken ?? null),
    // actorId intentionally invalidates selected-profile-scoped cached fields.
    [actor.id, actor.revision, nativeToken],
  );
  const value = useMemo(
    () => ({
      clearNativeSession,
      nativeToken: nativeToken ?? null,
      resetActor,
      retry,
      revision: actor.revision,
      setNativeSession,
    }),
    [actor.revision, clearNativeSession, nativeToken, resetActor, retry, setNativeSession],
  );

  if (nativeToken === undefined) {
    return <Splash label="세션을 복원하는 중입니다." />;
  }

  return (
    <RelayActorContext.Provider value={value}>
      <RelayEnvironmentProvider environment={environment}>{children}</RelayEnvironmentProvider>
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
