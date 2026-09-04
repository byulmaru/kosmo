import {
  createContext,
  forwardRef,
  Fragment,
  Suspense,
  useCallback,
  useContext,
  useImperativeHandle,
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
};

type RouteBoundaryResetDetails =
  | { reason: 'imperative-api'; args: unknown[] }
  | { reason: 'keys'; prev: unknown[] | undefined; next: unknown[] | undefined };

type RouteBoundaryProps = {
  children: ReactNode;
  description?: string;
  error?: (resetErrorBoundary: () => void) => ReactNode;
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
 * Route components should not maintain their own actor or query lifecycle state. `refetch` changes
 * only the visible query fetch key.
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

    const refetch = useCallback(() => setFetchKey((key) => key + 1), []);
    const reset = useCallback(
      (details: RouteBoundaryResetDetails) => {
        if (details.reason === 'keys') {
          return;
        }

        refetch();
        onRetry?.();
      },
      [onRetry, refetch],
    );

    useImperativeHandle(ref, () => ({ refetch }), [refetch]);

    const contextValue = { fetchKey, refetch };

    return (
      <RouteBoundaryContext.Provider value={contextValue}>
        <ErrorBoundary
          fallbackRender={({ resetErrorBoundary }) => {
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
            <Fragment key={remountOnActorChange ? actorLifecycleKey : undefined}>
              {children}
            </Fragment>
          </Suspense>
        </ErrorBoundary>
      </RouteBoundaryContext.Provider>
    );
  },
);
