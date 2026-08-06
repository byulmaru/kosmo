import { createContext, Suspense, useCallback, useContext, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { StateView } from '@/components/ui/StateView';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import type { ReactNode } from 'react';

type RouteBoundaryProps = {
  children: ReactNode;
  description?: string;
  error?: (retry: () => void) => ReactNode;
  loading: ReactNode;
  onRetry?: () => void;
  title: string;
};

type RouteBoundaryContextValue = {
  fetchKey: number;
  refetch: () => void;
  retry: () => void;
};

const RouteBoundaryContext = createContext<RouteBoundaryContextValue | null>(null);

/**
 * Returns the opaque query lifecycle owned by the nearest RouteBoundary.
 *
 * Route components should not maintain their own retry counters or compose actor and retry
 * revisions. The boundary remounts the query subtree and changes this key when retry is invoked.
 */
export function useRouteBoundary(): RouteBoundaryContextValue {
  const value = useContext(RouteBoundaryContext);
  if (!value) {
    throw new Error('useRouteBoundary must be used inside RouteBoundary.');
  }
  return value;
}

export function RouteBoundary({
  children,
  description,
  error: renderError,
  loading,
  onRetry,
  title,
}: RouteBoundaryProps) {
  const reportUnexpectedError = useUnexpectedErrorReporter();
  const [fetchKey, setFetchKey] = useState(0);
  const [subtreeKey, setSubtreeKey] = useState(0);
  const refetch = useCallback(() => setFetchKey((key) => key + 1), []);
  const retry = useCallback(() => {
    refetch();
    setSubtreeKey((key) => key + 1);
  }, [refetch]);
  const reset = useCallback(() => {
    retry();
    onRetry?.();
  }, [onRetry, retry]);

  return (
    <RouteBoundaryContext.Provider value={{ fetchKey, refetch, retry }}>
      <ErrorBoundary
        fallbackRender={({ resetErrorBoundary }) =>
          renderError ? (
            renderError(resetErrorBoundary)
          ) : (
            <StateView
              actionLabel="다시 시도"
              alert
              description={description ?? '잠시 후 다시 시도해주세요.'}
              onAction={resetErrorBoundary}
              title={title}
            />
          )
        }
        onError={(error, info) => {
          reportUnexpectedError?.(error, info);
          console.error('Route error', error, info.componentStack);
        }}
        onReset={reset}
      >
        <Suspense fallback={loading}>
          <RouteBoundaryQuerySubtree key={subtreeKey}>{children}</RouteBoundaryQuerySubtree>
        </Suspense>
      </ErrorBoundary>
    </RouteBoundaryContext.Provider>
  );
}

function RouteBoundaryQuerySubtree({ children }: { children: ReactNode }) {
  return children;
}
