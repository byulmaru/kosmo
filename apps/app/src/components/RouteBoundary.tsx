import { createContext, Suspense, useCallback, useContext, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { StateView } from '@/components/ui/StateView';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import type { ReactNode } from 'react';

type RouteBoundaryResetDetails =
  | { reason: 'imperative-api'; args: unknown[] }
  | { reason: 'keys'; prev: unknown[] | undefined; next: unknown[] | undefined };

type RouteBoundaryProps = {
  children: ReactNode;
  description?: string;
  error?: (retry: () => void) => ReactNode;
  loading: ReactNode;
  onRetry?: () => void;
  remountOnActorChange?: boolean;
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
 * lifecycle state. The boundary remounts the query subtree when retry is invoked or its actor
 * lifecycle changes.
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
  remountOnActorChange = true,
  title,
}: RouteBoundaryProps) {
  const reportUnexpectedError = useUnexpectedErrorReporter();
  const actorLifecycleKey = useRelayActorLifecycleKey();
  const [fetchKey, setFetchKey] = useState(0);
  const [subtreeKey, setSubtreeKey] = useState(0);
  const refetch = useCallback(() => setFetchKey((key) => key + 1), []);
  const retry = useCallback(() => {
    refetch();
    setSubtreeKey((key) => key + 1);
  }, [refetch]);
  const reset = useCallback(
    (details: RouteBoundaryResetDetails) => {
      if (details.reason === 'keys') {
        return;
      }

      retry();
      onRetry?.();
    },
    [onRetry, retry],
  );
  const querySubtreeKey = remountOnActorChange
    ? `${actorLifecycleKey}:${subtreeKey}`
    : String(subtreeKey);

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
        resetKeys={[actorLifecycleKey]}
      >
        <Suspense fallback={loading}>
          <RouteBoundaryQuerySubtree key={querySubtreeKey}>{children}</RouteBoundaryQuerySubtree>
        </Suspense>
      </ErrorBoundary>
    </RouteBoundaryContext.Provider>
  );
}

function RouteBoundaryQuerySubtree({ children }: { children: ReactNode }) {
  return children;
}
