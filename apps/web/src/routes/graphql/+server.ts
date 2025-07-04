import { PUBLIC_API_DOMAIN } from '$env/static/public';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const token = cookies.get('accessToken');
  const body = await request.text();

  const response = await fetch(`${PUBLIC_API_DOMAIN}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body,
  });

  return response;
};
