import * as Sentry from '@sentry/node';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const environment = process.env.ENVIRONMENT;
const release = process.env.SENTRY_RELEASE;
const enabled = Boolean(dsn && environment && release);

if (enabled) {
  Sentry.init({
    beforeBreadcrumb: () => null,
    beforeSendTransaction: (event) => {
      if (!event.request) {
        return event;
      }

      const request = { ...event.request };
      if (request.headers) {
        request.headers = Object.fromEntries(
          Object.entries(request.headers).filter(
            ([name]) =>
              !['authorization', 'proxy-authorization', 'cookie'].includes(name.toLowerCase()),
          ),
        );
      }
      delete request.cookies;

      return { ...event, request };
    },
    dsn,
    environment,
    integrations: (integrations) =>
      integrations.filter((integration) => integration.name !== 'Graphql'),
    initialScope: { tags: { runtime: 'api' } },
    release,
    sendDefaultPii: false,
    ...(environment === 'prod' ? { tracesSampleRate: 0.1 } : {}),
  });
}

export const reportError = (cause: unknown): null => {
  if (enabled) {
    Sentry.captureException(cause);
  }

  return null;
};
