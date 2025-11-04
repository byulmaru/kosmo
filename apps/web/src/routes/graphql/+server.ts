import { env } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const token = cookies.get('accessToken');
  const body = await request.text();

  const response = await fetch(`${env.PUBLIC_API_DOMAIN}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body,
  });

  return response;
};
