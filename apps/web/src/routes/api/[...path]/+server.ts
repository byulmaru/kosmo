import { PUBLIC_API_DOMAIN } from '$env/static/public';
import type { RequestHandler } from './$types';

const ALLOWED_PATHS = ['upload'];

export const fallback: RequestHandler = async ({ request, cookies, params }) => {
  if (!ALLOWED_PATHS.includes(params.path)) {
    return new Response('Not found', { status: 404 });
  }

  const token = cookies.get('accessToken');

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    headers.set(key, value);
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${PUBLIC_API_DOMAIN}/${params.path}`, {
    method: request.method,
    headers,
    body: request.body,
    // @ts-expect-error RequestInit 타입 추론 문제
    duplex: 'half',
  });

  return response;
};
