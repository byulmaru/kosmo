import { ErrorBoundary } from 'react-error-boundary';
import { StateView } from '@/components/ui/StateView';
import { formatGraphQLError } from '@/relay/network';
import type { PropsWithChildren } from 'react';

export type GraphQLErrorBoundaryProps = PropsWithChildren<{
  onRetry: () => void;
}>;

export function GraphQLErrorBoundary({ children, onRetry }: GraphQLErrorBoundaryProps) {
  return (
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
        console.error('Relay render error', error, info.componentStack);
      }}
      onReset={onRetry}
    >
      {children}
    </ErrorBoundary>
  );
}
