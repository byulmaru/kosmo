import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';

type PrimaryNavigationScrollContextValue = {
  clearQueryNavigation: (expected?: QueryNavigation) => void;
  consume: (pathname: string) => boolean;
  getQueryNavigation: () => QueryNavigation | null;
  record: (targetPathname: string) => void;
  recordQueryNavigation: (navigation: QueryNavigation) => void;
};

type QueryNavigation = {
  restoreFocus: boolean;
  scrollY: number;
};

type PendingIntent = {
  targetPathname: string;
  token: number;
};

const PrimaryNavigationScrollContext = createContext<PrimaryNavigationScrollContextValue>({
  clearQueryNavigation: () => undefined,
  consume: () => false,
  getQueryNavigation: () => null,
  record: () => undefined,
  recordQueryNavigation: () => undefined,
});

export function PrimaryNavigationScrollProvider({ children }: { children: ReactNode }) {
  const pendingIntentRef = useRef<PendingIntent | null>(null);
  const queryNavigationRef = useRef<QueryNavigation | null>(null);
  const tokenRef = useRef(0);

  // Keep browser scroll restoration enabled; replay the entry offset if Expo Router writes top after popstate.
  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      typeof window === 'undefined' ||
      !window.history ||
      !window.addEventListener
    ) {
      return;
    }

    const scrollPositions = new Map<string, number>();
    let frame = 0;
    let pendingHistoryKey: string | null = null;
    let attempts = 0;
    let settledFrames = 0;
    const getHistoryKey = () => {
      const state = window.history.state as { id?: unknown } | null;
      return typeof state?.id === 'string' ? state.id : window.location.href;
    };
    const saveScrollPosition = () => {
      if (!pendingHistoryKey) {
        scrollPositions.set(getHistoryKey(), window.scrollY);
      }
    };
    const restoreHistoryScroll = () => {
      if (!pendingHistoryKey) {
        return;
      }

      const targetScrollY = scrollPositions.get(pendingHistoryKey) ?? 0;
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (targetScrollY > maxScrollY && attempts < 60) {
        attempts += 1;
        frame = window.requestAnimationFrame(restoreHistoryScroll);
        return;
      }

      window.scrollTo({ behavior: 'auto', left: 0, top: Math.min(targetScrollY, maxScrollY) });
      settledFrames += 1;
      if (settledFrames < 60) {
        frame = window.requestAnimationFrame(restoreHistoryScroll);
        return;
      }

      pendingHistoryKey = null;
    };
    const handlePopState = () => {
      pendingHistoryKey = getHistoryKey();
      attempts = 0;
      settledFrames = 0;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(restoreHistoryScroll);
    };

    saveScrollPosition();
    window.addEventListener('scroll', saveScrollPosition, { passive: true });
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', saveScrollPosition);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const record = useCallback((targetPathname: string) => {
    if (Platform.OS !== 'web') {
      return;
    }

    pendingIntentRef.current = {
      targetPathname,
      token: ++tokenRef.current,
    };
  }, []);
  const consume = useCallback((pathname: string) => {
    const pendingIntent = pendingIntentRef.current;
    if (!pendingIntent || pendingIntent.targetPathname !== pathname) {
      return false;
    }

    pendingIntentRef.current = null;
    return true;
  }, []);
  const recordQueryNavigation = useCallback((navigation: QueryNavigation) => {
    if (Platform.OS === 'web') {
      queryNavigationRef.current = navigation;
    }
  }, []);
  const getQueryNavigation = useCallback(() => queryNavigationRef.current, []);
  const clearQueryNavigation = useCallback((expected?: QueryNavigation) => {
    if (!expected || queryNavigationRef.current === expected) {
      queryNavigationRef.current = null;
    }
  }, []);

  const value = useMemo(
    () => ({
      clearQueryNavigation,
      consume,
      getQueryNavigation,
      record,
      recordQueryNavigation,
    }),
    [clearQueryNavigation, consume, getQueryNavigation, record, recordQueryNavigation],
  );

  return (
    <PrimaryNavigationScrollContext.Provider value={value}>
      {children}
    </PrimaryNavigationScrollContext.Provider>
  );
}

export function usePrimaryNavigationScroll() {
  return useContext(PrimaryNavigationScrollContext);
}

export function PrimaryNavigationScrollReset({ pathname }: { pathname: string }) {
  const { clearQueryNavigation, consume } = usePrimaryNavigationScroll();

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    if (pathname !== '/search') {
      clearQueryNavigation();
    }
    if (!consume(pathname)) {
      return;
    }

    window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
  }, [clearQueryNavigation, consume, pathname]);

  return null;
}
