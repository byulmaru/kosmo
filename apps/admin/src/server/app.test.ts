import { describe, expect, test } from 'vitest';
import app from './app';

describe('Admin Console runtime', () => {
  test('reports workload health only on GET /healthz', async () => {
    const health = await app.request('/healthz');
    const invalidMethod = await app.request('/healthz', { method: 'POST' });

    expect(health.status).toBe(200);
    expect(await health.text()).toBe('ok');
    expect(invalidMethod.status).toBe(405);
    expect(invalidMethod.headers.get('allow')).toBe('GET');
  });

  test('returns the read-only shell with an anonymous Viewer fallback', async () => {
    const response = await app.request('/');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('식별 정보 없는 Admin Console Viewer');
  });

  test('uses only normalized login and display name as optional display metadata', async () => {
    const response = await app.request('/', {
      headers: {
        'Tailscale-User-Login': 'viewer@example.com',
        'Tailscale-User-Name': '=?UTF-8?B?7Jq07JiB7J6Q?=',
        'Tailscale-User-Profile-Pic': 'https://example.com/profile.png',
      },
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('운영자');
    expect(body).toContain('viewer@example.com');
    expect(body).not.toContain('profile.png');
  });

  test.each([
    '=?UTF-8?B?not base64?=',
    '=?UTF-8?Q?bad=XX?=',
    '=?ISO-8859-1?Q?viewer?=',
    '=?UTF-8?Q?unterminated',
  ])('treats malformed identity %s as absent without changing access', async (identity) => {
    const response = await app.request('/', {
      headers: { 'Tailscale-User-Name': identity },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('식별 정보 없는 Admin Console Viewer');
  });

  test('escapes identity display values', async () => {
    const response = await app.request('/', {
      headers: { 'Tailscale-User-Name': '<script>alert(1)</script>' },
    });
    const body = await response.text();

    expect(body).toContain('&lt;script&gt;');
    expect(body).not.toContain('<script>');
  });

  test('rejects undefined routes and shell mutation methods', async () => {
    const undefinedRoute = await app.request('/graphql');
    const shellMutation = await app.request('/', { method: 'POST' });

    expect(undefinedRoute.status).toBe(404);
    expect(await undefinedRoute.text()).toBe('Not Found');
    expect(shellMutation.status).toBe(405);
    expect(shellMutation.headers.get('allow')).toBe('GET');
  });
});
