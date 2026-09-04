import * as Sentry from '@sentry/react';
import { getPublicConfig } from '@/config/public';
import type { ErrorInfo } from 'react';

const channel = getPublicConfig('channel');
const dsn = getPublicConfig('sentryDsn');
const release = process.env.EXPO_PUBLIC_SENTRY_RELEASE;
const enabled = Boolean(release);

if (enabled) {
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
