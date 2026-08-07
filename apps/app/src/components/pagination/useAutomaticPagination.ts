import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  createNativeScrollHandlers,
  isScrollNearEnd,
  resumeNativePagination,
} from './nativeScrollPagination';
import type { ScrollMetrics } from './nativeScrollPagination';

export type LoadNext = (
  count: number,
  options: { onComplete: (error: Error | null) => void },
) => void;

export type UseAutomaticPaginationOptions = {
  hasNext: boolean;
  isLoadingNext: boolean;
  itemCount: number;
  loadNext: LoadNext;
  pageSize: number;
};

export type UseAutomaticPaginationResult = {
  loadError: boolean;
  loadNextPage: () => void;
  nativeScrollProps: ReturnType<typeof createNativeScrollHandlers>;
};

export function useAutomaticPagination({
  hasNext,
  isLoadingNext,
  itemCount,
  loadNext,
  pageSize,
}: UseAutomaticPaginationOptions): UseAutomaticPaginationResult {
  const [loadError, setLoadError] = useState(false);
  const [nativePageRevision, setNativePageRevision] = useState(0);
  const handledNativePageRevisionRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const pageErrorRef = useRef(false);
  const webNearEndCheckRef = useRef<(() => void) | null>(null);
  const nativeMetricsRef = useRef<ScrollMetrics>({
    contentLength: 0,
    offset: 0,
    viewportLength: 0,
  });

  const loadNextPage = useCallback(() => {
    if (!hasNext || isLoadingNext || requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    pageErrorRef.current = false;
    setLoadError(false);
    loadNext(pageSize, {
      onComplete: (error) => {
        pageErrorRef.current = Boolean(error);
        setLoadError(Boolean(error));
        if (error) {
          requestInFlightRef.current = false;
          return;
        }
        setTimeout(() => {
          if (Platform.OS === 'web') {
            window.requestAnimationFrame(() => {
              requestInFlightRef.current = false;
              webNearEndCheckRef.current?.();
            });
          } else {
            setNativePageRevision((revision) => revision + 1);
          }
        }, 0);
      },
    });
  }, [hasNext, isLoadingNext, loadNext, pageSize]);

  const maybeLoadNextPage = useCallback(
    (metrics: ScrollMetrics) => {
      if (!pageErrorRef.current && !loadError && isScrollNearEnd(metrics)) {
        loadNextPage();
      }
    },
    [loadError, loadNextPage],
  );

  const nativeScrollProps = useMemo(
    () => createNativeScrollHandlers(nativeMetricsRef, maybeLoadNextPage),
    [maybeLoadNextPage],
  );

  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      nativePageRevision === 0 ||
      isLoadingNext ||
      handledNativePageRevisionRef.current === nativePageRevision
    ) {
      return;
    }
    handledNativePageRevisionRef.current = nativePageRevision;
    resumeNativePagination(requestInFlightRef, nativeMetricsRef, maybeLoadNextPage);
  }, [isLoadingNext, maybeLoadNextPage, nativePageRevision]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const check = () =>
      maybeLoadNextPage({
        contentLength: document.documentElement.scrollHeight,
        offset: window.scrollY,
        viewportLength: window.innerHeight,
      });
    webNearEndCheckRef.current = check;
    const frame = window.requestAnimationFrame(check);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      if (webNearEndCheckRef.current === check) {
        webNearEndCheckRef.current = null;
      }
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [itemCount, maybeLoadNextPage]);

  return { loadError, loadNextPage, nativeScrollProps };
}
