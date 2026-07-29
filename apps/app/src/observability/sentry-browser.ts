import * as Sentry from '@sentry/react';
import type { ErrorInfo } from 'react';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const environment = process.env.EXPO_PUBLIC_ENVIRONMENT;
const release = process.env.EXPO_PUBLIC_SENTRY_RELEASE;
const enabled = Boolean(dsn && environment && release);

if (enabled) {
  Sentry.init({
    beforeBreadcrumb: () => null,
    dsn,
    environment,
    initialScope: { tags: { runtime: 'web' } },
    integrations: (integrations) =>
      integrations.filter((integration) => integration.name !== 'BrowserSession'),
    release,
    sendDefaultPii: false,
  });
}

export const captureReactError = (cause: unknown, info: ErrorInfo): void => {
  if (enabled) {
    Sentry.captureReactException(cause, info, {
      mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
    });
  }
};
