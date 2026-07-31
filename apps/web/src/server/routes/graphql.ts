import { sessionName } from '@kosmo/core';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { OidcAuthError } from '../auth';
import {
  observeProfileEditBody,
  profileEditCorrelationId,
  traceProfileEditBoundary,
} from '../profile-edit-diagnostics';

type StreamingRequestInit = RequestInit & { duplex: 'half' };

const graphqlRoutes = new Hono();

graphqlRoutes.post('/graphql', async (c) => {
  const correlationId = profileEditCorrelationId(c.req.raw.headers);
  traceProfileEditBoundary(correlationId, 'bff-request-start');
  const publicApiOrigin = process.env.PUBLIC_API_ORIGIN;
  if (!publicApiOrigin) {
    throw new OidcAuthError(500, 'PUBLIC_API_ORIGIN is required');
  }

  const headers = new Headers();
  const accept = c.req.header('accept');
  const explicitAuthorization = c.req.header('authorization');
  const sessionToken = getCookie(c, sessionName);

  headers.set('content-type', c.req.header('content-type') ?? 'application/json');
  if (accept) {
    headers.set('accept', accept);
  }
  if (correlationId) {
    headers.set('x-kosmo-correlation-id', correlationId);
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
  traceProfileEditBoundary(correlationId, 'bff-upstream-fetch-start');
  const response = await globalThis.fetch(new URL('/graphql', publicApiOrigin), requestInit);
  traceProfileEditBoundary(correlationId, 'bff-upstream-response-headers', {
    status: response.status,
  });

  return observeProfileEditBody(response, correlationId, 'bff-downstream-body-end');
});
graphqlRoutes.all('/graphql', (c) => c.text('Method Not Allowed', 405, { Allow: 'POST' }));

export default graphqlRoutes;
