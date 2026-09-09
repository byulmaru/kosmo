import { sessionName } from '@kosmo/core';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { OidcAuthError } from '../auth';

type StreamingRequestInit = RequestInit & { duplex: 'half' };

const graphqlRoutes = new Hono();

graphqlRoutes.post('/graphql', async (c) => {
  const internalApiOrigin = process.env.INTERNAL_API_ORIGIN;
  if (!internalApiOrigin) {
    throw new OidcAuthError(500, 'INTERNAL_API_ORIGIN is required');
  }

  const headers = new Headers();
  const accept = c.req.header('accept');
  const explicitAuthorization = c.req.header('authorization');
  const sessionToken = getCookie(c, sessionName);

  headers.set('content-type', c.req.header('content-type') ?? 'application/json');
  if (accept) {
    headers.set('accept', accept);
  }
  if (explicitAuthorization) {
    if (!/^Bearer\s+\S+$/i.test(explicitAuthorization)) {
      return c.text('Authorization header must use Bearer', 400);
    }

    headers.set('authorization', explicitAuthorization);
  } else if (sessionToken) {
    headers.set('authorization', `Bearer ${sessionToken}`);
  }

  const requestInit: StreamingRequestInit = {
    body: c.req.raw.body,
    duplex: 'half',
    headers,
    method: 'POST',
    redirect: 'manual',
  };
  const response = await globalThis.fetch(new URL('/graphql', internalApiOrigin), requestInit);

  return new Response(response.body, response);
});
graphqlRoutes.all('/graphql', (c) => c.text('Method Not Allowed', 405, { Allow: 'POST' }));

export default graphqlRoutes;
