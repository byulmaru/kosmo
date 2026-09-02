import { normalizeIdentityHeader } from '$lib/server/identity';
import type { Handle, HandleServerError } from '@sveltejs/kit';

const anonymousViewer = '식별 정보 없는 Admin Console Viewer';

export const handle: Handle = async ({ event, resolve }) => {
  const login = normalizeIdentityHeader(event.request.headers.get('Tailscale-User-Login'));
  const displayName = normalizeIdentityHeader(event.request.headers.get('Tailscale-User-Name'));
  event.locals.viewer = {
    label: displayName ?? login ?? anonymousViewer,
    ...(login ? { login } : {}),
  };

  const response = await resolve(event);
  response.headers.set('Cache-Control', 'no-store');

  return response;
};

export const handleError: HandleServerError = ({ status }) => ({
  message: status === 404 ? 'Not Found' : 'Admin Console unavailable',
});
