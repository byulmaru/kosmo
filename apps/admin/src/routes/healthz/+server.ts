import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => new Response('ok');

const methodNotAllowed = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });

export const HEAD = methodNotAllowed;
export const fallback = methodNotAllowed;
