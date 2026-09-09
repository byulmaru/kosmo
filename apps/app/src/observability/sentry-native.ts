import * as Sentry from '@sentry/react-native';
import { getPublicConfig } from '@/config/public';
import type { ErrorInfo } from 'react';

const channel = getPublicConfig('channel');
const dsn = getPublicConfig('sentryDsn');
const release = process.env.EXPO_PUBLIC_SENTRY_RELEASE;
const enabled = Boolean(dsn && channel && release);

type HandledErrorContext = Readonly<Record<string, string | number | boolean>>;

if (enabled) {
  Sentry.init({
    beforeBreadcrumb: () => null,
    dsn,
    enableAutoSessionTracking: false,
    environment: channel,
    initialScope: { tags: { runtime: 'native' } },
    release,
    sendDefaultPii: false,
  });
}

export const captureReactError = (cause: unknown, info: ErrorInfo): void => {
  if (!enabled) {
    return;
  }

  Sentry.withScope((scope) => {
    if (info.componentStack) {
      scope.setContext('react', { componentStack: info.componentStack });
    }

    Sentry.captureException(cause, {
      mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
    });
  });
};

export const captureHandledError = (error: Error, context?: HandledErrorContext): void => {
  if (!enabled) {
    return;
  }

  try {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
      }

      Sentry.captureException(error, {
        mechanism: { handled: true, type: 'auto.function.handled_error' },
      });
    });
  } catch {
    // Sentry reporting is best-effort and must not affect the product flow.
  }
};
