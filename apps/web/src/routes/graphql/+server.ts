import { sessionName } from '@kosmo/core';
import { env } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

type StreamingRequestInit = RequestInit & {
  duplex: 'half';
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  const headers = new Headers();
  const accept = request.headers.get('accept');
  const sessionKey = cookies.get(sessionName);

  headers.set('content-type', request.headers.get('content-type') ?? 'application/json');
  if (accept) {
    headers.set('accept', accept);
  }
  if (sessionKey) {
    headers.set('authorization', `Bearer ${sessionKey}`);
  }

  const requestInit: StreamingRequestInit = {
    body: request.body,
    duplex: 'half',
    headers,
    method: 'POST',
    redirect: 'manual',
  };

  const response = await fetch(new URL('/graphql', env.PUBLIC_API_ORIGIN), requestInit);

  return new Response(response.body, response);
};
