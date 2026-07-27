import * as Sentry from '@sentry/react';
import { createSentryOptions } from './sentry-config';
import type { ErrorInfo } from 'react';

const options = createSentryOptions({
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_SENTRY_ENABLED: process.env.EXPO_PUBLIC_SENTRY_ENABLED,
  EXPO_PUBLIC_SENTRY_ENVIRONMENT: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
  EXPO_PUBLIC_SENTRY_RELEASE: process.env.EXPO_PUBLIC_SENTRY_RELEASE,
});

if (options.enabled) {
  Sentry.init(options);
}

export const captureReactError = (cause: unknown, info: ErrorInfo): void => {
  if (options.enabled) {
    Sentry.captureReactException(cause, info, {
      mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
    });
  }
};
