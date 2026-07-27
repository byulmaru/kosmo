import * as Sentry from '@sentry/node';
import type { ErrorEvent, NodeOptions } from '@sentry/node';

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

export const createSentryOptions = (environment: SentryEnvironment): NodeOptions => {
  const dsn = environment.SENTRY_WEB_BFF_DSN;
  const deploymentEnvironment = environment.SENTRY_ENVIRONMENT;
  const release = environment.SENTRY_RELEASE;

  return {
    beforeBreadcrumb: () => null,
    beforeSend: redactSentryEvent,
    dsn,
    enabled: environment.SENTRY_ENABLED === '1' && Boolean(dsn && deploymentEnvironment && release),
    environment: deploymentEnvironment,
    initialScope: { tags: { runtime: 'web-bff' } },
    release,
    sendDefaultPii: false,
  };
};

const options = createSentryOptions(process.env);

if (options.enabled) {
  Sentry.init(options);
}

export const captureUnexpectedError = (cause: unknown): void => {
  if (options.enabled) {
    Sentry.captureException(cause);
  }
};
