import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';

const ROBOTS_SOURCE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../app/public/robots.txt',
);

test('production-like export serves the repository robots.txt for regular and navigation requests', async ({
  request,
}) => {
  const source = await readFile(ROBOTS_SOURCE, 'utf8');
  const responses = await Promise.all([
    request.get('/robots.txt'),
    request.get('/robots.txt', {
      headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' },
    }),
  ]);

  for (const response of responses) {
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    const body = await response.text();
    expect(body).toBe(source);
    expect(body).not.toContain('<html>');
  }
});
