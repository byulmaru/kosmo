import { federation } from '@kosmo/fedify';
import { getXForwardedRequest } from 'x-forwarded-fetch';

export const handle = async ({ event, resolve }) => {
  const request = await getXForwardedRequest(event.request.clone());

  return federation.fetch(request, {
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

export { handleError } from './handle-error';
