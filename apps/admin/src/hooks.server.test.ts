import { describe, expect, test } from 'vitest';
import { handle } from './hooks.server';

describe('Admin Console request policy', () => {
  test('stores normalized viewer metadata locally and disables response caching', async () => {
    const locals = {} as App.Locals;
    const response = await handle({
      event: {
        request: new Request('http://admin.test/', {
          headers: { 'Tailscale-User-Login': 'viewer@example.com' },
        }),
        locals,
      } as Parameters<typeof handle>[0]['event'],
      resolve: async () => new Response('shell'),
    });

    expect(locals.viewer).toEqual({ label: 'viewer@example.com', login: 'viewer@example.com' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
