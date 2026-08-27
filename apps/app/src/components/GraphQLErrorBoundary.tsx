import { useCallback, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { StateView } from '@/components/ui/StateView';
import {
  UnexpectedErrorContext,
  useUnexpectedErrorReporter,
} from '@/observability/UnexpectedErrorContext';
import { formatGraphQLError } from '@/relay/network';
import type { PropsWithChildren } from 'react';
import type { UnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';

export type GraphQLErrorBoundaryProps = PropsWithChildren<{
  onError?: UnexpectedErrorReporter;
  onRetry?: () => void;
}>;

export function GraphQLErrorBoundary({ children, onError, onRetry }: GraphQLErrorBoundaryProps) {
  const inheritedErrorReporter = useUnexpectedErrorReporter();
  const reportError = onError ?? inheritedErrorReporter;
  const [retryKey, setRetryKey] = useState(0);
  const reset = useCallback(() => {
    setRetryKey((key) => key + 1);
    onRetry?.();
  }, [onRetry]);

  return (
    <UnexpectedErrorContext.Provider value={reportError}>
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <StateView
            actionLabel="다시 시도"
            alert
            description={formatGraphQLError(error)}
            onAction={resetErrorBoundary}
            title="화면을 불러오지 못했어요"
          />
        )}
        onError={(error, info) => {
          reportError?.(error, info);
          console.error('Relay render error', error, info.componentStack);
        }}
        onReset={reset}
      >
        <GraphQLErrorSubtree key={retryKey}>{children}</GraphQLErrorSubtree>
      </ErrorBoundary>
    </UnexpectedErrorContext.Provider>
  );
}

function GraphQLErrorSubtree({ children }: PropsWithChildren) {
  return children;
}
