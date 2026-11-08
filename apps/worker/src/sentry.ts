import * as Sentry from '@sentry/node';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const environment = process.env.ENVIRONMENT;
const release = process.env.SENTRY_RELEASE;

if (dsn && environment && release) {
  Sentry.init({
    beforeBreadcrumb: () => null,
    defaultIntegrations: false,
    dsn,
    environment,
    initialScope: { tags: { runtime: 'worker' } },
    release,
    sendDefaultPii: false,
    tracesSampleRate: environment === 'prod' ? 0.1 : 1,
  });
}
