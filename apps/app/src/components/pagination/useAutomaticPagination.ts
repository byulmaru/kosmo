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
  webScrollTarget?: 'container' | 'document';
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
  webScrollTarget = 'document',
}: UseAutomaticPaginationOptions): UseAutomaticPaginationResult {
  const [loadError, setLoadError] = useState(false);
  const [containerPageRevision, setContainerPageRevision] = useState(0);
  const handledContainerPageRevisionRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const pageErrorRef = useRef(false);
  const webNearEndCheckRef = useRef<(() => void) | null>(null);
  const nativeMetricsRef = useRef<ScrollMetrics>({
    contentLength: 0,
    offset: 0,
    viewportLength: 0,
  });
  const latestOptionsRef = useRef({
    hasNext,
    isLoadingNext,
    loadNext,
    pageSize,
    webScrollTarget,
  });
  latestOptionsRef.current = {
    hasNext,
    isLoadingNext,
    loadNext,
    pageSize,
    webScrollTarget,
  };

  const loadNextPage = useCallback(() => {
    const latestOptions = latestOptionsRef.current;
    if (!latestOptions.hasNext || latestOptions.isLoadingNext || requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    pageErrorRef.current = false;
    setLoadError(false);
    latestOptions.loadNext(latestOptions.pageSize, {
      onComplete: (error) => {
        pageErrorRef.current = Boolean(error);
        setLoadError(Boolean(error));
        if (error) {
          requestInFlightRef.current = false;
          return;
        }
        setTimeout(() => {
          if (Platform.OS === 'web' && latestOptionsRef.current.webScrollTarget === 'document') {
            window.requestAnimationFrame(() => {
              requestInFlightRef.current = false;
              webNearEndCheckRef.current?.();
            });
          } else {
            setContainerPageRevision((revision) => revision + 1);
          }
        }, 0);
      },
    });
  }, []);

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
      (Platform.OS === 'web' && webScrollTarget === 'document') ||
      containerPageRevision === 0 ||
      isLoadingNext ||
      handledContainerPageRevisionRef.current === containerPageRevision
    ) {
      return;
    }
    handledContainerPageRevisionRef.current = containerPageRevision;
    resumeNativePagination(requestInFlightRef, nativeMetricsRef, maybeLoadNextPage);
  }, [containerPageRevision, isLoadingNext, maybeLoadNextPage, webScrollTarget]);

  useEffect(() => {
    if (Platform.OS !== 'web' || webScrollTarget !== 'document') {
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
  }, [itemCount, maybeLoadNextPage, webScrollTarget]);

  return { loadError, loadNextPage, nativeScrollProps };
}
