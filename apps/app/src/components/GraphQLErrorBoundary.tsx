import { ClientErrorBoundary } from '@/components/ClientErrorBoundary';
import { StateView } from '@/components/ui/StateView';
import { UnexpectedErrorScreen } from '@/components/UnexpectedErrorScreen';
import { isExpectedClientError } from '@/observability/client-error';
import {
  SafeErrorNavigationContext,
  UnexpectedErrorContext,
  useSafeErrorNavigation,
  useUnexpectedErrorReporter,
} from '@/observability/UnexpectedErrorContext';
import { formatGraphQLError } from '@/relay/network';
import type { PropsWithChildren } from 'react';
import type { UnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';

export type GraphQLErrorBoundaryProps = PropsWithChildren<{
  onError?: UnexpectedErrorReporter;
  onRetry: () => void;
  onSafeNavigate?: () => void;
}>;

export function GraphQLErrorBoundary({
  children,
  onError,
  onRetry,
  onSafeNavigate,
}: GraphQLErrorBoundaryProps) {
  const inheritedErrorReporter = useUnexpectedErrorReporter();
  const inheritedSafeNavigation = useSafeErrorNavigation();
  const reportError = onError ?? inheritedErrorReporter;
  const safeNavigation = onSafeNavigate ?? inheritedSafeNavigation ?? (() => undefined);

  return (
    <UnexpectedErrorContext.Provider value={reportError}>
      <SafeErrorNavigationContext.Provider value={safeNavigation}>
        <ClientErrorBoundary
          onError={reportError}
          onReset={onRetry}
          renderFallback={({ error, eventId, resetErrorBoundary }) =>
            isExpectedClientError(error) ? (
              <StateView
                actionLabel="다시 시도"
                alert
                description={formatGraphQLError(error)}
                onAction={resetErrorBoundary}
                title="화면을 불러오지 못했어요"
              />
            ) : (
              <UnexpectedErrorScreen
                eventId={eventId}
                onRetry={resetErrorBoundary}
                onSafeNavigate={safeNavigation}
              />
            )
          }
        >
          {children}
        </ClientErrorBoundary>
      </SafeErrorNavigationContext.Provider>
    </UnexpectedErrorContext.Provider>
  );
}
