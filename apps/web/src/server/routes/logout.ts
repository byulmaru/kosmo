import { sessionName } from '@kosmo/core';
import { revokeCurrentSession } from '@kosmo/core/services';
import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';

const logoutRoutes = new Hono();

logoutRoutes.post('/logout', async (c) => {
  const requestUrl = new URL(c.req.url);
  const publicOrigin = new URL(process.env.PUBLIC_ORIGIN ?? requestUrl.origin);
  if (c.req.header('origin') !== publicOrigin.origin) {
    return c.text('Forbidden', 403);
  }

  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');

  await revokeCurrentSession({ token: getCookie(c, sessionName) });

  deleteCookie(c, sessionName, {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: publicOrigin.protocol === 'https:',
  });

  return c.body(null, 204);
});

logoutRoutes.all('/logout', (c) => c.text('Method Not Allowed', 405, { Allow: 'POST' }));

export default logoutRoutes;
