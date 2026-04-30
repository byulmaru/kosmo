import { sessionCookieName } from '@kosmo/core';

export async function POST(request: Request) {
  const headers = new Headers();
  const accept = request.headers.get('accept');
  const sessionKey = getCookie(request, sessionCookieName);

  headers.set('content-type', request.headers.get('content-type') ?? 'application/json');
  if (accept) {
    headers.set('accept', accept);
  }

  if (sessionKey) {
    headers.set('authorization', `Bearer ${sessionKey}`);
  }

  const response = await fetch(`${process.env.API_URL}/graphql`, {
    body: await request.text(),
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
