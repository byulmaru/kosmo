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
  const cancelHistoryRestoreRef = useRef<(() => void) | null>(null);

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
    const maxLayoutAttempts = 60;
    const stableFrameCount = 2;
    let frame = 0;
    let pendingHistoryEntry: { href: string; key: string } | null = null;
    let attempts = 0;
    let settledFrames = 0;
    let lastScrollHeight: number | null = null;
    const getHistoryKey = () => {
      const state = window.history.state as { id?: unknown } | null;
      return typeof state?.id === 'string' ? state.id : window.location.href;
    };
    const getHistoryEntry = () => ({ href: window.location.href, key: getHistoryKey() });
    const cancelHistoryRestore = () => {
      pendingHistoryEntry = null;
      attempts = 0;
      settledFrames = 0;
      lastScrollHeight = null;
      window.cancelAnimationFrame(frame);
      frame = 0;
    };
    cancelHistoryRestoreRef.current = cancelHistoryRestore;
    const saveScrollPosition = () => {
      if (!pendingHistoryEntry) {
        scrollPositions.set(getHistoryKey(), window.scrollY);
      }
    };
    const restoreHistoryScroll = () => {
      const pendingEntry = pendingHistoryEntry;
      if (!pendingEntry) {
        return;
      }

      const currentEntry = getHistoryEntry();
      if (currentEntry.key !== pendingEntry.key || currentEntry.href !== pendingEntry.href) {
        cancelHistoryRestore();
        return;
      }

      const targetScrollY = scrollPositions.get(pendingEntry.key);
      if (targetScrollY === undefined) {
        cancelHistoryRestore();
        return;
      }

      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (targetScrollY > maxScrollY && attempts < maxLayoutAttempts) {
        attempts += 1;
        frame = window.requestAnimationFrame(restoreHistoryScroll);
        return;
      }

      const nextScrollY = Math.min(targetScrollY, maxScrollY);
      window.scrollTo({ behavior: 'auto', left: 0, top: nextScrollY });

      const entryAfterScroll = getHistoryEntry();
      if (
        entryAfterScroll.key !== pendingEntry.key ||
        entryAfterScroll.href !== pendingEntry.href
      ) {
        cancelHistoryRestore();
        return;
      }

      const scrollHeight = document.documentElement.scrollHeight;
      if (window.scrollY === nextScrollY && scrollHeight === lastScrollHeight) {
        settledFrames += 1;
      } else {
        settledFrames = 0;
      }
      lastScrollHeight = scrollHeight;
      if (settledFrames >= stableFrameCount) {
        cancelHistoryRestore();
        return;
      }

      if (pendingHistoryEntry) {
        frame = window.requestAnimationFrame(restoreHistoryScroll);
      }
    };
    const handlePopState = () => {
      cancelHistoryRestore();
      const pendingEntry = getHistoryEntry();
      if (!scrollPositions.has(pendingEntry.key)) {
        return;
      }

      pendingHistoryEntry = pendingEntry;
      attempts = 0;
      settledFrames = 0;
      frame = window.requestAnimationFrame(restoreHistoryScroll);
    };

    saveScrollPosition();
    window.addEventListener('scroll', saveScrollPosition, { passive: true });
    window.addEventListener('popstate', handlePopState);
    for (const eventName of ['keydown', 'pointerdown', 'touchstart', 'wheel']) {
      window.addEventListener(eventName, cancelHistoryRestore, { capture: true, passive: true });
    }

    return () => {
      cancelHistoryRestore();
      cancelHistoryRestoreRef.current = null;
      window.removeEventListener('scroll', saveScrollPosition);
      window.removeEventListener('popstate', handlePopState);
      for (const eventName of ['keydown', 'pointerdown', 'touchstart', 'wheel']) {
        window.removeEventListener(eventName, cancelHistoryRestore, true);
      }
    };
  }, []);

  const record = useCallback((targetPathname: string) => {
    if (Platform.OS !== 'web') {
      return;
    }

    cancelHistoryRestoreRef.current?.();
    pendingIntentRef.current = { targetPathname };
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
