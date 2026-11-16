import { ErrorBoundary } from 'react-error-boundary';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import { NativeResumeRetry } from './NativeResumeRetry';
import type { PropsWithChildren, ReactNode } from 'react';

export function RelayFailOpenBoundary({
  children,
  fallback,
  onRetry,
  reportUnexpectedErrors = true,
  resetKey,
}: PropsWithChildren<{
  fallback: ReactNode;
  onRetry?: () => void;
  reportUnexpectedErrors?: boolean;
  resetKey?: number;
}>) {
  const reportUnexpectedError = useUnexpectedErrorReporter();
  const actorLifecycleKey = useRelayActorLifecycleKey();

  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => (
        <>
          <NativeResumeRetry onRetry={resetErrorBoundary} />
          {fallback}
        </>
      )}
      onReset={(details) => {
        if (details.reason === 'imperative-api') {
          onRetry?.();
        }
      }}
      onError={reportUnexpectedErrors ? reportUnexpectedError : undefined}
      resetKeys={[actorLifecycleKey, resetKey]}
    >
      {children}
    </ErrorBoundary>
  );
}
