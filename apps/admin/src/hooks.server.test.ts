import { describe, expect, test } from 'vitest';
import { handle, handleError } from './hooks.server';

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

  test('preserves intentional errors', async () => {
    const error = { status: 404, message: 'Profile not found', code: 'PROFILE_NOT_FOUND' } as const;
    const result = await handleError({
      kind: 'app',
      error,
      event: {} as Parameters<typeof handleError>[0]['event'],
    });

    expect(result).toEqual(error);
  });

  test('keeps framework 404s generic', async () => {
    const result = await handleError({
      kind: 'framework',
      error: { status: 404, message: 'Not Found' },
      event: {} as Parameters<typeof handleError>[0]['event'],
    });

    expect(result).toEqual({ message: 'Not Found' });
  });

  test('hides unexpected error details', async () => {
    const result = await handleError({
      kind: 'unknown',
      error: new Error('database connection secret'),
      event: {} as Parameters<typeof handleError>[0]['event'],
    });

    expect(result).toEqual({ message: 'Admin Console unavailable' });
  });
});
