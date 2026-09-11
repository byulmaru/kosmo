import { ErrorBoundary } from 'react-error-boundary';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import type { PropsWithChildren, ReactNode } from 'react';

export function RelayFailOpenBoundary({
  children,
  fallback,
  reportUnexpectedErrors = true,
  resetKey,
}: PropsWithChildren<{
  fallback: ReactNode;
  reportUnexpectedErrors?: boolean;
  resetKey?: number;
}>) {
  const reportUnexpectedError = useUnexpectedErrorReporter();
  const actorLifecycleKey = useRelayActorLifecycleKey();

  return (
    <ErrorBoundary
      fallback={fallback}
      onError={reportUnexpectedErrors ? reportUnexpectedError : undefined}
      resetKeys={[actorLifecycleKey, resetKey]}
    >
      {children}
    </ErrorBoundary>
  );
}
