import {
  createContext,
  forwardRef,
  Suspense,
  useCallback,
  useContext,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { StateView } from '@/components/ui/StateView';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import type { ReactNode } from 'react';

export type RouteBoundaryHandle = {
  /** Re-run the visible route query while retaining the mounted route subtree. */
  refetch: () => void;
  /** Reset a failed route and re-run its query. */
  retry: () => void;
};

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

type RouteBoundaryContextValue = RouteBoundaryHandle & {
  fetchKey: number;
};

const RouteBoundaryContext = createContext<RouteBoundaryContextValue | null>(null);

/**
 * Returns the query lifecycle owned by the nearest RouteBoundary.
 *
 * Route components should not maintain their own retry counters or compose actor and retry
 * lifecycle state. `refetch` changes only the visible query fetch key, while `retry` also resets
 * the failed query subtree.
 */
export function useRouteBoundary(): RouteBoundaryContextValue {
  const value = useContext(RouteBoundaryContext);

  if (!value) {
    throw new Error('useRouteBoundary must be used inside RouteBoundary.');
  }

  return value;
}

export const RouteBoundary = forwardRef<RouteBoundaryHandle, RouteBoundaryProps>(
  function RouteBoundary(
    {
      children,
      description,
      error: renderError,
      loading,
      onRetry,
      remountOnActorChange = true,
      title,
    },
    ref,
  ) {
    const reportUnexpectedError = useUnexpectedErrorReporter();
    const actorLifecycleKey = useRelayActorLifecycleKey();
    const [fetchKey, setFetchKey] = useState(0);
    const [subtreeKey, setSubtreeKey] = useState(0);
    const resetErrorBoundaryRef = useRef<(() => void) | null>(null);
    const hasErrorRef = useRef(false);

    const refetch = useCallback(() => setFetchKey((key) => key + 1), []);
    const resetQuerySubtree = useCallback(() => {
      refetch();
      setSubtreeKey((key) => key + 1);
    }, [refetch]);
    const retry = useCallback(() => {
      if (hasErrorRef.current) {
        // ErrorBoundary invokes `onReset` synchronously after this callback. The reset handler owns
        // the fetch/subtree keys and session recovery callback, avoiding a duplicate increment.
        resetErrorBoundaryRef.current?.();
        return;
      }

      resetQuerySubtree();
      onRetry?.();
    }, [onRetry, resetQuerySubtree]);
    const reset = useCallback(
      (details: RouteBoundaryResetDetails) => {
        hasErrorRef.current = false;
        if (details.reason === 'keys') {
          return;
        }

        resetQuerySubtree();
        onRetry?.();
      },
      [onRetry, resetQuerySubtree],
    );

    useImperativeHandle(ref, () => ({ refetch, retry }), [refetch, retry]);

    const querySubtreeKey = remountOnActorChange
      ? `${actorLifecycleKey}:${subtreeKey}`
      : String(subtreeKey);
    const contextValue = { fetchKey, refetch, retry };

    return (
      <RouteBoundaryContext.Provider value={contextValue}>
        <ErrorBoundary
          fallbackRender={({ resetErrorBoundary }) => {
            resetErrorBoundaryRef.current = resetErrorBoundary;
            hasErrorRef.current = true;

            return renderError ? (
              renderError(resetErrorBoundary)
            ) : (
              <StateView
                actionLabel="다시 시도"
                alert
                description={description ?? '잠시 후 다시 시도해주세요.'}
                onAction={resetErrorBoundary}
                title={title}
              />
            );
          }}
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
  },
);

function RouteBoundaryQuerySubtree({ children }: { children: ReactNode }) {
  return children;
}
