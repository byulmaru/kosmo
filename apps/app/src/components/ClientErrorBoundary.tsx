import { useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { isExpectedClientError } from '@/observability/client-error';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import type { ErrorInfo, PropsWithChildren, ReactNode } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import type { UnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';

export type ClientErrorFallbackProps = FallbackProps & {
  eventId?: string;
};

type ClientErrorBoundaryProps = PropsWithChildren<{
  onError?: UnexpectedErrorReporter;
  onReset: () => void;
  renderFallback: (props: ClientErrorFallbackProps) => ReactNode;
}>;

export function ClientErrorBoundary({
  children,
  onError,
  onReset,
  renderFallback,
}: ClientErrorBoundaryProps) {
  const inheritedReporter = useUnexpectedErrorReporter();
  const reporter = onError ?? inheritedReporter;

  return (
    <ReportedErrorBoundary onError={reporter} onReset={onReset} renderFallback={renderFallback}>
      {children}
    </ReportedErrorBoundary>
  );
}

function ReportedErrorBoundary({
  children,
  onError,
  onReset,
  renderFallback,
}: ClientErrorBoundaryProps) {
  const reportedErrorRef = useRef<unknown>(null);
  const [reported, setReported] = useState<{
    error: unknown;
    eventId?: string;
  } | null>(null);

  return (
    <ErrorBoundary
      fallbackRender={(props) =>
        renderFallback({
          ...props,
          eventId: reported && reported.error === props.error ? reported.eventId : undefined,
        })
      }
      onError={(error, info) => {
        if (isExpectedClientError(error) || reportedErrorRef.current === error) {
          return;
        }

        reportedErrorRef.current = error;
        let eventId: string | undefined;
        try {
          eventId = onError?.(error, info);
        } catch {
          eventId = undefined;
        }
        setReported({ error, eventId });
        logBoundaryError(error, info);
      }}
      onReset={() => {
        reportedErrorRef.current = null;
        setReported(null);
        onReset();
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

function logBoundaryError(error: unknown, info: ErrorInfo): void {
  console.error('Client render error', error, info.componentStack);
}
