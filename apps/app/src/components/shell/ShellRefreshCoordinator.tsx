import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { PropsWithChildren } from 'react';

type ShellRefreshCoordinatorValue = {
  refresh: () => void;
  subscribe: (listener: () => void) => () => void;
};

const ShellRefreshCoordinatorContext = createContext<ShellRefreshCoordinatorValue | null>(null);

export function ShellRefreshCoordinatorProvider({ children }: PropsWithChildren) {
  const listenersRef = useRef(new Set<() => void>());
  const refresh = useCallback(() => {
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);
  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);
  const value = useMemo(() => ({ refresh, subscribe }), [refresh, subscribe]);

  return (
    <ShellRefreshCoordinatorContext.Provider value={value}>
      {children}
    </ShellRefreshCoordinatorContext.Provider>
  );
}

export function useShellRefresh(): () => void {
  return useShellRefreshCoordinator().refresh;
}

export function useShellRefreshListener(listener: () => void): void {
  const { subscribe } = useShellRefreshCoordinator();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => subscribe(() => listenerRef.current()), [subscribe]);
}

function useShellRefreshCoordinator(): ShellRefreshCoordinatorValue {
  const value = useContext(ShellRefreshCoordinatorContext);

  if (!value) {
    throw new Error('ShellRefreshCoordinatorProvider is required.');
  }

  return value;
}
