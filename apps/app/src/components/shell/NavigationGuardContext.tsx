import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
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

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.navigation) {
      return;
    }

    const navigation = window.navigation;
    const bypassMarker = Symbol('navigation-guard-bypass');
    const onNavigate = (event: NavigateEvent) => {
      if (
        event.info === bypassMarker ||
        event.navigationType !== 'traverse' ||
        !event.destination.sameDocument ||
        !event.destination.key ||
        !event.cancelable
      ) {
        return;
      }

      if (
        !request(() => {
          const result = navigation.traverseTo(event.destination.key, { info: bypassMarker });
          void result.finished?.catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') {
              return;
            }
            console.error('Navigation guard traversal failed', error);
          });
        })
      ) {
        return;
      }

      event.preventDefault();
    };

    navigation.addEventListener('navigate', onNavigate);
    return () => navigation.removeEventListener('navigate', onNavigate);
  }, [request]);

  return (
    <NavigationGuardContext.Provider value={{ register, request }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export const useNavigationGuard = () => useContext(NavigationGuardContext);
