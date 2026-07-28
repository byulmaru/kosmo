import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { StateView } from '@/components/ui/StateView';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import type { ReactNode } from 'react';

type RouteBoundaryProps = {
  children: ReactNode;
  description?: string;
  error?: (retry: () => void) => ReactNode;
  loading: ReactNode;
  onRetry: () => void;
  title: string;
};

export function RouteBoundary({
  children,
  description,
  error: renderError,
  loading,
  onRetry,
  title,
}: RouteBoundaryProps) {
  const reportUnexpectedError = useUnexpectedErrorReporter();

  return (
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
      onReset={onRetry}
    >
      <Suspense fallback={loading}>{children}</Suspense>
    </ErrorBoundary>
  );
}
