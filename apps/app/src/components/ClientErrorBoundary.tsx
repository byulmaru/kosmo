import { useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { isExpectedClientError } from '@/observability/client-error';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import type { ErrorInfo, PropsWithChildren, ReactNode } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import type { UnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';

export type ClientErrorFallbackProps = FallbackProps & {
  eventId?: string;
  occurrenceKey?: number;
  resetForSafeNavigation: () => void;
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
  const reportedErrorRef = useRef<unknown>(unreportedError);
  const occurrenceCounterRef = useRef(0);
  const [boundaryKey, setBoundaryKey] = useState(0);
  const [reported, setReported] = useState<{
    error: unknown;
    eventId?: string;
    occurrenceKey: number;
  } | null>(null);
  const clearReportedError = () => {
    reportedErrorRef.current = unreportedError;
    setReported(null);
  };
  const resetBoundary = (props: FallbackProps, ...args: unknown[]) => {
    if (props.error === null || props.error === undefined) {
      clearReportedError();
      setBoundaryKey((key) => key + 1);
      if (args[0] !== safeNavigationReset) {
        onReset();
      }
      return;
    }

    props.resetErrorBoundary(...args);
  };

  return (
    <ErrorBoundary
      key={boundaryKey}
      fallbackRender={(props) =>
        renderFallback({
          ...props,
          resetErrorBoundary: (...args) => resetBoundary(props, ...args),
          eventId: reported && reported.error === props.error ? reported.eventId : undefined,
          occurrenceKey:
            reported && reported.error === props.error ? reported.occurrenceKey : undefined,
          resetForSafeNavigation: () => resetBoundary(props, safeNavigationReset),
        })
      }
      onError={(error, info) => {
        if (isExpectedClientError(error) || reportedErrorRef.current === error) {
          return;
        }

        reportedErrorRef.current = error;
        let eventId: string | undefined;
        try {
          eventId = reporter?.(error, info);
        } catch {
          eventId = undefined;
        }
        setReported({ error, eventId, occurrenceKey: ++occurrenceCounterRef.current });
        logBoundaryError(error, info);
      }}
      onReset={(details) => {
        clearReportedError();
        if (details.reason !== 'imperative-api' || details.args[0] !== safeNavigationReset) {
          onReset();
        }
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

const unreportedError = Symbol('unreported-client-error');
const safeNavigationReset = Symbol('safe-navigation-reset');

function logBoundaryError(error: unknown, info: ErrorInfo): void {
  console.error('Client render error', error, info.componentStack);
}
