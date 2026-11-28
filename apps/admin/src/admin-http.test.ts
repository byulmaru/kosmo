import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { expect, test } from 'vitest';

test('serves the escaped Admin shell and enforces its routes', async ({ onTestFinished }) => {
  const server = await createServer({
    logLevel: 'error',
    mode: 'development',
    server: { host: '127.0.0.1', port: 0, hmr: false },
  });
  onTestFinished(() => server.close());
  await server.listen();
  const address = server.httpServer?.address();
  assert(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  const name = '<script>alert(1)</script>';
  const home = await fetch(`${origin}/`, { headers: { 'Tailscale-User-Name': name } });
  expect(home.status).toBe(200);
  expect(home.headers.get('cache-control')).toBe('no-store');
  const html = await home.text();
  expect(html).toContain('&lt;script>alert(1)&lt;/script>');
  expect(html).not.toContain(name);

  const health = await fetch(`${origin}/healthz`);
  expect(health.status).toBe(200);

  for (const path of ['/', '/healthz']) {
    const response = await fetch(`${origin}${path}`, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toMatch(/\bGET\b/i);
  }

  const graphql = await fetch(`${origin}/graphql`);
  expect(graphql.status).toBe(404);
}, 15_000);
