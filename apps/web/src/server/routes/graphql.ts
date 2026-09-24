import { sessionName } from '@kosmo/core';
import { feedbackMultipartMaxBytes, readRequestBodyWithinLimit } from '@kosmo/core/validation';
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
  const isMultipart = c.req.header('content-type')?.toLowerCase().startsWith('multipart/form-data');

  if (isMultipart && !explicitAuthorization && sessionToken) {
    const publicOrigin = new URL(process.env.PUBLIC_ORIGIN ?? new URL(c.req.url).origin);
    if (c.req.header('origin') !== publicOrigin.origin) {
      return c.text('Forbidden', 403);
    }
  }

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

  const body = isMultipart
    ? await readRequestBodyWithinLimit(c.req.raw, feedbackMultipartMaxBytes)
    : undefined;
  if (isMultipart && body === null) {
    return c.text('Request body too large', 413);
  }

  const requestInit: StreamingRequestInit = {
    body: isMultipart ? body : c.req.raw.body,
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
