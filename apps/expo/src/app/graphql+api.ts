import { sessionName } from '@kosmo/core';

export async function POST(request: Request) {
  const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;

  if (!apiOrigin) {
    return Response.json({ error: 'EXPO_PUBLIC_API_ORIGIN is required' }, { status: 500 });
  }

  const headers = new Headers();
  const accept = request.headers.get('accept');
  const sessionKey = getCookie(request, sessionName);

  headers.set('content-type', request.headers.get('content-type') ?? 'application/json');
  if (accept) {
    headers.set('accept', accept);
  }

  if (sessionKey) {
    headers.set('authorization', `Bearer ${sessionKey}`);
  }

  const response = await fetch(new URL('/graphql', apiOrigin), {
    body: request.body,
    headers,
    method: 'POST',
    redirect: 'manual',
  });

  return new Response(response.body, response);
}

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return undefined;
  }

  const cookiePrefix = `${name}=`;
  const cookie = cookieHeader.split(';').find((part) => part.trim().startsWith(cookiePrefix));
  const value = cookie?.trim().slice(cookiePrefix.length);

  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
