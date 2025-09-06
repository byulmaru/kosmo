import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';
import { handleExceptedError } from './handle-error';

Sentry.init({
  dsn: env.PUBLIC_SENTRY_DSN,
  sendDefaultPii: true,
});

export const handleError = async ({ error }) => {
  const exceptedError = await handleExceptedError(error);
  if (exceptedError) {
    return exceptedError;
  }

  const traceId = Sentry.captureException(error);

  return {
    message: 'error.unknown',
    traceId,
  };
};
