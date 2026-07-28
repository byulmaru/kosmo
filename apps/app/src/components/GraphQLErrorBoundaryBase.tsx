import { ErrorBoundary } from 'react-error-boundary';
import { StateView } from '@/components/ui/StateView';
import { UnexpectedErrorContext } from '@/observability/UnexpectedErrorContext';
import { formatGraphQLError } from '@/relay/network';
import type { PropsWithChildren } from 'react';
import type { UnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';

export type GraphQLErrorBoundaryProps = PropsWithChildren<{
  onError?: UnexpectedErrorReporter;
  onRetry: () => void;
}>;

export function GraphQLErrorBoundaryBase({
  children,
  onError,
  onRetry,
}: GraphQLErrorBoundaryProps) {
  return (
    <UnexpectedErrorContext.Provider value={onError}>
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
          onError?.(error, info);
          console.error('Relay render error', error, info.componentStack);
        }}
        onReset={onRetry}
      >
        {children}
      </ErrorBoundary>
    </UnexpectedErrorContext.Provider>
  );
}
