import { Fragment, Suspense, useCallback, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Splash } from '@/components/Splash';
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
  const [runtimeKey, setRuntimeKey] = useState(0);
  const reset = useCallback(() => {
    setRuntimeKey((key) => key + 1);
    onRetry?.();
  }, [onRetry]);

  return (
    <UnexpectedErrorContext.Provider value={reportError}>
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <StateView
            actionLabel="앱 다시 불러오기"
            alert
            description={formatGraphQLError(error)}
            onAction={resetErrorBoundary}
            title="앱을 불러오지 못했어요"
          />
        )}
        onError={(error, info) => {
          reportError?.(error, info);
          console.error('Relay render error', error, info.componentStack);
        }}
        onReset={reset}
      >
        <Suspense fallback={<Splash label="앱을 불러오는 중입니다." />}>
          <Fragment key={runtimeKey}>{children}</Fragment>
        </Suspense>
      </ErrorBoundary>
    </UnexpectedErrorContext.Provider>
  );
}
