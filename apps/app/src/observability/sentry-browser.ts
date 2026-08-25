import * as Sentry from '@sentry/react';
import type { ErrorInfo } from 'react';
import type { BrowserRuntimeConfig } from '@/runtimeConfig';

let initialized = false;
let enabled = false;

export function initializeBrowserSentry(config: BrowserRuntimeConfig): boolean {
  if (initialized) {
    return enabled;
  }

  initialized = true;
  const release = process.env.EXPO_PUBLIC_SENTRY_RELEASE;
  if (!config.sentryDsn || !release) {
    return false;
  }

  try {
    Sentry.init({
      beforeBreadcrumb: () => null,
      dsn: config.sentryDsn,
      environment: config.environment,
      initialScope: { tags: { runtime: 'web' } },
      integrations: (integrations) =>
        integrations.filter((integration) => integration.name !== 'BrowserSession'),
      release,
      sendDefaultPii: false,
    });
    enabled = true;
  } catch {
    // Browser telemetry is best-effort and must not block application startup.
    enabled = false;
  }
  return enabled;
}

export const captureReactError = (cause: unknown, info: ErrorInfo): void => {
  if (enabled) {
    Sentry.captureReactException(cause, info, {
      mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
    });
  }
};

export function resetBrowserSentryForTests(): void {
  initialized = false;
  enabled = false;
}
