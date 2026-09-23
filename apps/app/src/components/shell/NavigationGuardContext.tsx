import { createContext, useCallback, useContext, useRef } from 'react';
import type { ReactNode } from 'react';

export type GuardedNavigationAction = () => void;
// false allows navigation; true blocks it; deferred retains the action for confirmation.
export type NavigationRequestHandler = (action: GuardedNavigationAction) => boolean | 'deferred';

type NavigationGuardContextValue = {
  register: (handler: NavigationRequestHandler) => () => void;
  request: NavigationRequestHandler;
};

const defaultValue: NavigationGuardContextValue = {
  register: () => () => undefined,
  request: () => false,
};

const NavigationGuardContext = createContext(defaultValue);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<NavigationRequestHandler | null>(null);
  const register = useCallback((handler: NavigationRequestHandler) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) {
        handlerRef.current = null;
      }
    };
  }, []);
  const request = useCallback<NavigationRequestHandler>(
    (action) => handlerRef.current?.(action) ?? false,
    [],
  );

  return (
    <NavigationGuardContext.Provider value={{ register, request }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export const useNavigationGuard = () => useContext(NavigationGuardContext);
