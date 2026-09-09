import * as Sentry from '@sentry/react';
import { getPublicConfig } from '@/config/public';
import type { ErrorInfo } from 'react';

const release = process.env.EXPO_PUBLIC_SENTRY_RELEASE;
const enabled = Boolean(release);

type HandledErrorContext = Readonly<Record<string, string | number | boolean>>;

if (enabled) {
  const channel = getPublicConfig('channel');
  const dsn = getPublicConfig('sentryDsn');

  Sentry.init({
    beforeBreadcrumb: () => null,
    dsn,
    environment: channel,
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
