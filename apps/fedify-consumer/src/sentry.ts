import * as Sentry from '@sentry/node';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const environment = process.env.ENVIRONMENT;
const release = process.env.SENTRY_RELEASE;

if (dsn && environment && release) {
  Sentry.init({
    beforeBreadcrumb: () => null,
    dsn,
    enableLogs: true,
    environment,
    initialScope: { tags: { runtime: 'fedify-consumer' } },
    release,
    sendDefaultPii: false,
  });
}

export { Sentry };
