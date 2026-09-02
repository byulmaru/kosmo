import { describe, expect, test } from 'vitest';
import { handle } from './hooks.server';

describe('Admin Console request policy', () => {
  test('stores normalized viewer metadata locally and disables response caching', async () => {
    const locals = {} as App.Locals;
    const response = await handle({
      event: {
        request: new Request('http://admin.test/', {
          headers: {
            'Tailscale-User-Login': 'viewer@example.com',
            'Tailscale-User-Name': '=?UTF-8?Q?bad=XX?=',
            'Tailscale-User-Profile-Pic': 'https://example.com/profile.png',
          },
        }),
        locals,
      } as Parameters<typeof handle>[0]['event'],
      resolve: async () => new Response('shell'),
    });

    expect(locals.viewer).toEqual({ label: 'viewer@example.com', login: 'viewer@example.com' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('creates a nonempty anonymous viewer label when identity is absent', async () => {
    const locals = {} as App.Locals;
    await handle({
      event: {
        request: new Request('http://admin.test/'),
        locals,
      } as Parameters<typeof handle>[0]['event'],
      resolve: async () => new Response('shell'),
    });

    expect(locals.viewer.login).toBeUndefined();
    expect(locals.viewer.label.length).toBeGreaterThan(0);
  });
});
