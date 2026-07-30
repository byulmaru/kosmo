import { Suspense } from 'react';
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary';
import { StateView } from '@/components/ui/StateView';
import { UnexpectedErrorScreen } from '@/components/UnexpectedErrorScreen';
import { isExpectedClientError } from '@/observability/client-error';
import {
  useSafeErrorNavigation,
  useUnexpectedErrorReporter,
} from '@/observability/UnexpectedErrorContext';
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
  const safeNavigation = useSafeErrorNavigation() ?? (() => undefined);

  return (
    <ClientErrorBoundary
      onError={reportUnexpectedError}
      onReset={onRetry}
      renderFallback={({ error, eventId, resetErrorBoundary }) =>
        isExpectedClientError(error) ? (
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
        ) : (
          <UnexpectedErrorScreen
            eventId={eventId}
            onRetry={resetErrorBoundary}
            onSafeNavigate={safeNavigation}
          />
        )
      }
    >
      <Suspense fallback={loading}>{children}</Suspense>
    </ClientErrorBoundary>
  );
}
