import { getViewerFromHeaders } from './server/viewer';
import type { Handle, HandleServerError } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.viewer = getViewerFromHeaders(event.request.headers);

  const response = await resolve(event);
  response.headers.set('Cache-Control', 'no-store');

  return response;
};

export const handleError: HandleServerError = ({ status }) => ({
  message: status === 404 ? 'Not Found' : 'Admin Console unavailable',
});
