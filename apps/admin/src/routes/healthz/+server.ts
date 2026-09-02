import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => new Response('ok');

export const HEAD: RequestHandler = () =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'GET' },
  });

export const fallback: RequestHandler = () =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'GET' },
  });
