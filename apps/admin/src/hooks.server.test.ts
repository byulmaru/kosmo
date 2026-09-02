import { describe, expect, test } from 'vitest';
import { handle } from './hooks.server';

describe('Admin Console response policy', () => {
  test('stores viewer metadata locally and disables caching for page responses', async () => {
    const locals: App.Locals = { viewer: { label: 'unset' } };
    const response = await handle({
      event: {
        request: new Request('http://admin.test/', {
          headers: { 'Tailscale-User-Login': 'viewer@example.com' },
        }),
        url: new URL('http://admin.test/'),
        locals,
      } as Parameters<typeof handle>[0]['event'],
      resolve: async () => new Response('shell'),
    });

    expect(locals.viewer).toEqual({ label: 'viewer@example.com', login: 'viewer@example.com' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
