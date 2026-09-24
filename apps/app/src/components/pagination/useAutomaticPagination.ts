import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  createNativeScrollHandlers,
  isScrollNearEnd,
  resumeNativePagination,
} from './nativeScrollPagination';
import type { RefObject } from 'react';
import type { View } from 'react-native';
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
  nativePagination?: 'endReached' | 'metrics';
  pageSize: number;
  requestKey?: string;
  webScrollTarget?: 'container' | 'document';
};

export type UseAutomaticPaginationResult = {
  endRef: RefObject<View | null>;
  loadError: boolean;
  loadNextPage: () => void;
  nativeScrollProps: ReturnType<typeof createNativeScrollHandlers>;
  onEndReached: () => void;
  resetError: () => void;
};

export function useAutomaticPagination({
  hasNext,
  isLoadingNext,
  itemCount,
  loadNext,
  nativePagination = 'metrics',
  pageSize,
  requestKey,
  webScrollTarget = 'document',
}: UseAutomaticPaginationOptions): UseAutomaticPaginationResult {
  const [loadError, setLoadError] = useState(false);
  const endRef = useRef<View>(null);
  const [containerPageRevision, setContainerPageRevision] = useState(0);
  const handledContainerPageRevisionRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const pageErrorRef = useRef(false);
  const requestKeyRef = useRef(requestKey);
  const requestGenerationRef = useRef(0);
  if (requestKeyRef.current !== requestKey) {
    requestKeyRef.current = requestKey;
    requestGenerationRef.current += 1;
    requestInFlightRef.current = false;
    pageErrorRef.current = false;
  }
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
    nativePagination,
    pageSize,
    webScrollTarget,
  });
  latestOptionsRef.current = {
    hasNext,
    isLoadingNext,
    loadNext,
    nativePagination,
    pageSize,
    webScrollTarget,
  };

  const loadNextPage = useCallback(() => {
    const latestOptions = latestOptionsRef.current;
    if (!latestOptions.hasNext || latestOptions.isLoadingNext || requestInFlightRef.current) {
      return;
    }

    requestInFlightRef.current = true;
    const activeRequestGeneration = requestGenerationRef.current;
    pageErrorRef.current = false;
    setLoadError(false);
    latestOptions.loadNext(latestOptions.pageSize, {
      onComplete: (error) => {
        if (requestGenerationRef.current !== activeRequestGeneration) {
          return;
        }
        pageErrorRef.current = Boolean(error);
        setLoadError(Boolean(error));
        if (error) {
          requestInFlightRef.current = false;
          return;
        }
        if (Platform.OS !== 'web' && latestOptions.nativePagination === 'endReached') {
          requestInFlightRef.current = false;
          return;
        }
        setTimeout(() => {
          if (requestGenerationRef.current !== activeRequestGeneration) {
            return;
          }
          if (Platform.OS === 'web' && latestOptionsRef.current.webScrollTarget === 'document') {
            window.requestAnimationFrame(() => {
              if (requestGenerationRef.current !== activeRequestGeneration) {
                return;
              }
              requestInFlightRef.current = false;
              webNearEndCheckRef.current?.();
            });
          } else if (latestOptionsRef.current.nativePagination === 'metrics') {
            setContainerPageRevision((revision) => revision + 1);
          } else {
            requestInFlightRef.current = false;
          }
        }, 0);
      },
    });
  }, []);

  const resetError = useCallback(() => {
    pageErrorRef.current = false;
    setLoadError(false);
  }, []);

  useEffect(() => {
    resetError();
  }, [requestKey, resetError]);

  const onEndReached = useCallback(() => {
    if (nativePagination !== 'endReached' || pageErrorRef.current || loadError) {
      return;
    }

    loadNextPage();
  }, [loadError, loadNextPage, nativePagination]);

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
      nativePagination === 'endReached' ||
      containerPageRevision === 0 ||
      isLoadingNext ||
      handledContainerPageRevisionRef.current === containerPageRevision
    ) {
      return;
    }
    handledContainerPageRevisionRef.current = containerPageRevision;
    resumeNativePagination(requestInFlightRef, nativeMetricsRef, maybeLoadNextPage);
  }, [containerPageRevision, isLoadingNext, maybeLoadNextPage, nativePagination, webScrollTarget]);

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

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      !endRef.current ||
      !hasNext ||
      isLoadingNext ||
      loadError ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !pageErrorRef.current) {
          loadNextPage();
        }
      },
      { rootMargin: '100% 0px' },
    );
    observer.observe(endRef.current as unknown as Element);
    return () => observer.disconnect();
  }, [hasNext, isLoadingNext, itemCount, loadError, loadNextPage]);

  return { endRef, loadError, loadNextPage, nativeScrollProps, onEndReached, resetError };
}
