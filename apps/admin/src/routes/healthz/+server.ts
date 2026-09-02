export const GET = () => new Response('ok');

const methodNotAllowed = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });

export const HEAD = methodNotAllowed;
export const fallback = methodNotAllowed;
