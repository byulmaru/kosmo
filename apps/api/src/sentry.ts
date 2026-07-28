import * as Sentry from '@sentry/node';
import type { NodeOptions } from '@sentry/node';

export type Environment = Readonly<Record<string, string | undefined>>;

export const createSentryOptions = (environment: Environment): NodeOptions => {
  const dsn = environment.EXPO_PUBLIC_SENTRY_DSN;
  const deploymentEnvironment = environment.ENVIRONMENT;
  const release = environment.SENTRY_RELEASE;

  return {
    beforeBreadcrumb: () => null,
    dsn,
    enabled: Boolean(dsn && deploymentEnvironment && release),
    environment: deploymentEnvironment,
    initialScope: { tags: { runtime: 'api' } },
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
