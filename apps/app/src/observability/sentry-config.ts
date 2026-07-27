import type { BrowserOptions, ErrorEvent } from '@sentry/react';

type SentryEnvironment = Readonly<Record<string, string | undefined>>;

export const redactSentryEvent = (event: ErrorEvent): ErrorEvent => ({
  debug_meta: event.debug_meta,
  environment: event.environment,
  event_id: event.event_id,
  exception: event.exception,
  level: event.level,
  platform: event.platform,
  release: event.release,
  sdk: event.sdk,
  tags: event.tags?.runtime ? { runtime: event.tags.runtime } : undefined,
  timestamp: event.timestamp,
  type: undefined,
});

export const createSentryOptions = (environment: SentryEnvironment): BrowserOptions => {
  const dsn = environment.EXPO_PUBLIC_SENTRY_DSN;
  const deploymentEnvironment = environment.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
  const release = environment.EXPO_PUBLIC_SENTRY_RELEASE;

  return {
    beforeBreadcrumb: () => null,
    beforeSend: redactSentryEvent,
    dsn,
    enabled:
      environment.EXPO_PUBLIC_SENTRY_ENABLED === '1' &&
      Boolean(dsn && deploymentEnvironment && release),
    environment: deploymentEnvironment,
    initialScope: { tags: { runtime: 'web' } },
    release,
    sendDefaultPii: false,
  };
};
