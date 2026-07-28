import type { BrowserOptions } from '@sentry/react';

type Environment = Readonly<Record<string, string | undefined>>;

export const createSentryOptions = (environment: Environment): BrowserOptions => {
  const dsn = environment.EXPO_PUBLIC_SENTRY_DSN;
  const deploymentEnvironment = environment.EXPO_PUBLIC_ENVIRONMENT;
  const release = environment.EXPO_PUBLIC_SENTRY_RELEASE;

  return {
    beforeBreadcrumb: () => null,
    dsn,
    enabled: Boolean(dsn && deploymentEnvironment && release),
    environment: deploymentEnvironment,
    initialScope: { tags: { runtime: 'web' } },
    integrations: (integrations) =>
      integrations.filter((integration) => integration.name !== 'BrowserSession'),
    release,
    sendDefaultPii: false,
  };
};
