import * as Sentry from '@sentry/node';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const environment = process.env.ENVIRONMENT;
const release = process.env.SENTRY_RELEASE;
const enabled = Boolean(dsn && environment && release);

if (enabled) {
  Sentry.init({
    beforeBreadcrumb: () => null,
    dsn,
    environment,
    initialScope: { tags: { runtime: 'api' } },
    release,
    sendDefaultPii: false,
  });
}

export const captureUnexpectedError = (cause: unknown): void => {
  if (enabled) {
    Sentry.captureException(cause);
  }
};
