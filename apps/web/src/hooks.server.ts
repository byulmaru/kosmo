import { ActivityPubService } from '@kosmo/service';
import * as Sentry from '@sentry/sveltekit';
import { getXForwardedRequest } from 'x-forwarded-fetch';
import { handleExceptedError } from './handle-error';

export const handle = async ({ event, resolve }) => {
  const request = await getXForwardedRequest(event.request.clone());

  return ActivityPubService.federation.fetch(request, {
    contextData: null,
    async onNotFound(): Promise<Response> {
      return await resolve(event);
    },

    async onNotAcceptable(): Promise<Response> {
      const res = await resolve(event);
      if (res.status !== 404) {
        return res;
      }
      return new Response('Not acceptable', {
        status: 406,
        headers: {
          'Content-Type': 'text/plain',
          Vary: 'Accept',
        },
      });
    },
  });
};

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
